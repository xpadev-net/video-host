import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import {
  type FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useNotify } from "@/components/Feedback/FeedbackProvider";
import { authClient } from "@/lib/auth-client";
import { client, getSelectedProfileId } from "@/lib/client";

type Movie = Pick<FormattedMovie, "id" | "title" | "thumbnailUrl">;

interface MovieItem {
  movie: Movie;
  order: number;
}

interface MovieManagerProps {
  entityType: "series" | "playlist";
  entityId: string;
  movies: MovieItem[];
  onMoviesChange: (movies: MovieItem[]) => void;
}

export const MovieManager: FC<MovieManagerProps> = ({
  entityType,
  entityId,
  movies,
  onMoviesChange,
}) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const notify = useNotify();
  const [availableMovies, setAvailableMovies] = useState<Movie[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState<string>("");
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const addMutationIdRef = useRef(0);
  const profileIdRef = useRef(selectedProfileId);
  const profileGenerationRef = useRef(0);
  const previousSelectionRef = useRef({ selectedAccountId, selectedProfileId });
  const dragContextRef = useRef<{
    profileId: string | null;
    generation: number;
  } | null>(null);
  const moviesRef = useRef(movies);
  const mountedRef = useRef(true);
  moviesRef.current = movies;

  const isCurrentProfileMutation = (
    profileId: string | null,
    generation: number,
  ) =>
    mountedRef.current &&
    profileIdRef.current === profileId &&
    getSelectedProfileId() === profileId &&
    profileGenerationRef.current === generation;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  // Fetch available movies for selection
  const fetchAvailableMovies = useCallback(
    async (profileId: string | null) => {
      const requestId = ++requestIdRef.current;
      if (!session) return;
      setIsLoadingMovies(true);
      try {
        const res = await client.api.v4.movies.$get(
          {
            query: {
              limit: "100",
              author: selectedAccountId || undefined,
              mine: selectedAccountId ? undefined : "true",
            },
          },
          {
            headers: profileId ? { "X-Profile-Id": profileId } : {},
          },
        );

        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        const allMovies = json.data.items;
        // Filter out movies already in the list
        const movieIds = new Set(movies.map((m) => m.movie.id));
        if (requestId !== requestIdRef.current) return;
        setAvailableMovies(
          allMovies
            .filter((m) => !movieIds.has(m.id))
            .map((m) => ({
              ...m,
              thumbnailUrl: m.thumbnailUrl ?? undefined,
            })),
        );
      } catch (error) {
        if (requestId === requestIdRef.current)
          console.error("Failed to fetch movies", error);
      } finally {
        if (requestId === requestIdRef.current) setIsLoadingMovies(false);
      }
    },
    [session, selectedAccountId, movies],
  );

  useEffect(() => {
    void fetchAvailableMovies(selectedProfileId);
  }, [fetchAvailableMovies, selectedProfileId]);

  useLayoutEffect(() => {
    if (
      previousSelectionRef.current.selectedAccountId === selectedAccountId &&
      previousSelectionRef.current.selectedProfileId === selectedProfileId
    )
      return;
    previousSelectionRef.current = { selectedAccountId, selectedProfileId };
    profileIdRef.current = selectedProfileId;
    profileGenerationRef.current += 1;
    setSelectedMovieId("");
    setDraggedIndex(null);
    dragContextRef.current = null;
  }, [selectedAccountId, selectedProfileId]);

  const handleAddMovie = async () => {
    if (!selectedMovieId || !session) return;
    const profileId = selectedProfileId;
    const profileGeneration = profileGenerationRef.current;
    const mutationId = ++addMutationIdRef.current;
    const movie = availableMovies.find((item) => item.id === selectedMovieId);
    setIsAdding(true);
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies.$post(
              {
                param: { series: entityId },
                json: { movieId: selectedMovieId },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            )
          : await client.api.v4.playlists[":playlist"].movies.$post(
              {
                param: { playlist: entityId },
                json: { movieId: selectedMovieId },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            );

      if (!res.ok) throw new Error("Failed to add");
      if (!isCurrentProfileMutation(profileId, profileGeneration)) return;

      if (
        movie &&
        !moviesRef.current.some((item) => item.movie.id === movie.id)
      ) {
        const newMovie: MovieItem = {
          movie,
          order: moviesRef.current.length + 1,
        };
        onMoviesChange([...moviesRef.current, newMovie]);
      }
      setSelectedMovieId("");
    } catch {
      if (isCurrentProfileMutation(profileId, profileGeneration))
        notify("動画の追加に失敗しました");
    } finally {
      if (mountedRef.current && addMutationIdRef.current === mutationId)
        setIsAdding(false);
    }
  };

  const handleRemoveMovie = async (movieId: string) => {
    if (!session) return;
    const profileId = selectedProfileId;
    const profileGeneration = profileGenerationRef.current;
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies[":movie"].$delete(
              {
                param: { series: entityId, movie: movieId },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            )
          : await client.api.v4.playlists[":playlist"].movies[":movie"].$delete(
              {
                param: { playlist: entityId, movie: movieId },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            );

      if (!res.ok) throw new Error("Failed to remove");
      if (!isCurrentProfileMutation(profileId, profileGeneration)) return;

      onMoviesChange(moviesRef.current.filter((m) => m.movie.id !== movieId));
    } catch {
      if (isCurrentProfileMutation(profileId, profileGeneration))
        notify("動画の削除に失敗しました");
    }
  };

  const handleDragStart = (index: number) => {
    dragContextRef.current = {
      profileId: selectedProfileId,
      generation: profileGenerationRef.current,
    };
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder locally while dragging
    const newMovies = [...movies];
    const [draggedItem] = newMovies.splice(draggedIndex, 1);
    newMovies.splice(index, 0, draggedItem);
    onMoviesChange(newMovies);
    setDraggedIndex(index);
  };

  const updateServerOrder = async (
    ids: string[],
    profileId: string | null,
    profileGeneration: number,
  ) => {
    if (!session || !isCurrentProfileMutation(profileId, profileGeneration))
      return;
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies.$patch(
              {
                param: { series: entityId },
                json: {
                  movieIds: ids,
                },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            )
          : await client.api.v4.playlists[":playlist"].movies.$patch(
              {
                param: { playlist: entityId },
                json: {
                  movieIds: ids,
                },
              },
              { headers: { "X-Profile-Id": profileId ?? "" } },
            );
      if (!res.ok) throw new Error("Failed to update order");
    } catch {
      if (!isCurrentProfileMutation(profileId, profileGeneration)) return;
      notify("並び替えに失敗しました");
      // Could revert here if needed
    }
  };

  const handleDragEnd = async () => {
    const dragContext = dragContextRef.current;
    if (draggedIndex === null || !session || !dragContext) return;
    const movieIds = movies.map((m) => m.movie.id);
    dragContextRef.current = null;
    await updateServerOrder(
      movieIds,
      dragContext.profileId,
      dragContext.generation,
    );
    setDraggedIndex(null);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0 || !session) return;
    const newMovies = [...movies];
    [newMovies[index - 1], newMovies[index]] = [
      newMovies[index],
      newMovies[index - 1],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(
      movieIds,
      selectedProfileId,
      profileGenerationRef.current,
    );
  };

  const handleMoveDown = async (index: number) => {
    if (index === movies.length - 1 || !session) return;
    const newMovies = [...movies];
    [newMovies[index], newMovies[index + 1]] = [
      newMovies[index + 1],
      newMovies[index],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(
      movieIds,
      selectedProfileId,
      profileGenerationRef.current,
    );
  };

  return (
    <div className="movie-manager">
      <h3>動画一覧</h3>

      {/* Add Movie Section */}
      <div className="add-movie-section">
        <select
          aria-label="追加する動画を選択"
          value={selectedMovieId}
          onChange={(e) => setSelectedMovieId(e.target.value)}
          disabled={isLoadingMovies || isAdding}
          className="movie-select"
        >
          <option value="">動画を選択...</option>
          {availableMovies.map((movie) => (
            <option key={movie.id} value={movie.id}>
              {movie.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAddMovie}
          disabled={!selectedMovieId || isAdding}
          className="add-btn"
        >
          {isAdding ? "追加中..." : "追加"}
        </button>
      </div>

      {/* Movies List */}
      {movies.length === 0 ? (
        <p className="no-movies">動画がありません</p>
      ) : (
        <ul className="movies-list">
          {movies.map((m, index) => (
            <li
              key={m.movie.id}
              className={`movie-item ${draggedIndex === index ? "dragging" : ""}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="movie-order">{index + 1}</span>
              <span className="movie-title">{m.movie.title}</span>
              <div className="movie-actions">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="move-btn"
                  title="上へ"
                  aria-label={`${m.movie.title}を上へ移動`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === movies.length - 1}
                  className="move-btn"
                  title="下へ"
                  aria-label={`${m.movie.title}を下へ移動`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveMovie(m.movie.id)}
                  className="remove-btn"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
