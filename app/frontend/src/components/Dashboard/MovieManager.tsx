import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import {
  type DragEvent,
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
  const [availablePage, setAvailablePage] = useState(1);
  const [hasMoreAvailableMovies, setHasMoreAvailableMovies] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState<string>("");
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isMembershipPending, setIsMembershipPending] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const orderingRef = useRef(false);
  const membershipActionRef = useRef(false);
  const orderingMutationIdRef = useRef(0);
  const membershipMutationIdRef = useRef(0);
  const profileIdRef = useRef(selectedProfileId);
  const profileGenerationRef = useRef(0);
  const previousSelectionRef = useRef({ selectedAccountId, selectedProfileId });
  const dragContextRef = useRef<{
    profileId: string | null;
    generation: number;
  } | null>(null);
  const dragStartMoviesRef = useRef<MovieItem[]>([]);
  const availableRequestGenerationRef = useRef(0);
  const isCurrentProfileMutation = (
    profileId: string | null,
    generation: number,
  ) =>
    profileIdRef.current === profileId &&
    getSelectedProfileId() === profileId &&
    profileGenerationRef.current === generation;

  // Fetch available movies for selection
  const fetchAvailableMovies = useCallback(
    async (
      page = 1,
      append = false,
      generation = availableRequestGenerationRef.current,
    ) => {
      if (!session) return;
      setIsLoadingMovies(true);
      try {
        const res = await client.api.v4.movies.$get(
          {
            query: {
              page: String(page),
              limit: "100",
              author: selectedAccountId || undefined,
              mine: selectedAccountId ? undefined : "true",
            },
          },
          { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
        );

        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (generation !== availableRequestGenerationRef.current) return;
        const pageMovies = json.data.items.map((movie) => ({
          ...movie,
          thumbnailUrl: movie.thumbnailUrl ?? undefined,
        }));
        setAvailableMovies((current) =>
          append ? [...current, ...pageMovies] : pageMovies,
        );
        setAvailablePage(page);
        setHasMoreAvailableMovies(json.data.pagination.hasNext);
      } catch (error) {
        if (generation === availableRequestGenerationRef.current) {
          console.error("Failed to fetch movies", error);
        }
      } finally {
        if (generation === availableRequestGenerationRef.current) {
          setIsLoadingMovies(false);
        }
      }
    },
    [session, selectedAccountId, selectedProfileId],
  );

  useEffect(() => {
    const generation = ++availableRequestGenerationRef.current;
    setAvailableMovies([]);
    setAvailablePage(1);
    setHasMoreAvailableMovies(false);
    void fetchAvailableMovies(1, false, generation);
    return () => {
      availableRequestGenerationRef.current += 1;
    };
  }, [fetchAvailableMovies]);

  useLayoutEffect(() => {
    if (
      previousSelectionRef.current.selectedAccountId === selectedAccountId &&
      previousSelectionRef.current.selectedProfileId === selectedProfileId
    )
      return;
    previousSelectionRef.current = { selectedAccountId, selectedProfileId };
    profileIdRef.current = selectedProfileId;
    profileGenerationRef.current += 1;
    availableRequestGenerationRef.current += 1;
    membershipMutationIdRef.current += 1;
    orderingMutationIdRef.current += 1;
    membershipActionRef.current = false;
    orderingRef.current = false;
    dragContextRef.current = null;
    setAvailableMovies([]);
    setAvailablePage(1);
    setHasMoreAvailableMovies(false);
    setSelectedMovieId("");
    setDraggedIndex(null);
    setIsAdding(false);
    setIsMembershipPending(false);
    setIsOrdering(false);
  }, [selectedAccountId, selectedProfileId]);

  const handleAddMovie = async () => {
    if (
      !selectedMovieId ||
      !session ||
      orderingRef.current ||
      membershipActionRef.current
    )
      return;
    membershipActionRef.current = true;
    setIsMembershipPending(true);
    setIsAdding(true);
    const profileId = selectedProfileId;
    const profileGeneration = profileGenerationRef.current;
    const mutationId = ++membershipMutationIdRef.current;
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

      // Find the movie and add it to the list
      const movie = availableMovies.find((m) => m.id === selectedMovieId);
      if (movie) {
        const newMovie: MovieItem = {
          movie,
          order: movies.length + 1,
        };
        onMoviesChange([...movies, newMovie]);
      }
      setSelectedMovieId("");
    } catch {
      if (isCurrentProfileMutation(profileId, profileGeneration))
        notify("動画の追加に失敗しました");
    } finally {
      if (membershipMutationIdRef.current === mutationId) {
        setIsAdding(false);
        membershipActionRef.current = false;
        setIsMembershipPending(false);
      }
    }
  };

  const handleRemoveMovie = async (movieId: string) => {
    if (!session || orderingRef.current || membershipActionRef.current) return;
    membershipActionRef.current = true;
    setIsMembershipPending(true);
    const profileId = selectedProfileId;
    const profileGeneration = profileGenerationRef.current;
    const mutationId = ++membershipMutationIdRef.current;
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies[":movie"].$delete(
              { param: { series: entityId, movie: movieId } },
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

      onMoviesChange(movies.filter((m) => m.movie.id !== movieId));
    } catch {
      if (isCurrentProfileMutation(profileId, profileGeneration))
        notify("動画の削除に失敗しました");
    } finally {
      if (membershipMutationIdRef.current === mutationId) {
        membershipActionRef.current = false;
        setIsMembershipPending(false);
      }
    }
  };

  const handleDragStart = (e: DragEvent<HTMLLIElement>, index: number) => {
    if (orderingRef.current || membershipActionRef.current) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", movies[index].movie.id);
    e.dataTransfer.effectAllowed = "move";
    dragStartMoviesRef.current = movies;
    dragContextRef.current = {
      profileId: selectedProfileId,
      generation: profileGenerationRef.current,
    };
    setDraggedIndex(index);
  };

  const handleDragOver = (e: DragEvent<HTMLLIElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
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
    rollbackMovies: MovieItem[],
    profileId: string | null,
    profileGeneration: number,
  ) => {
    if (
      !session ||
      orderingRef.current ||
      membershipActionRef.current ||
      !isCurrentProfileMutation(profileId, profileGeneration)
    )
      return;
    orderingRef.current = true;
    setIsOrdering(true);
    const mutationId = ++orderingMutationIdRef.current;
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
      if (!isCurrentProfileMutation(profileId, profileGeneration)) return;
    } catch {
      if (!isCurrentProfileMutation(profileId, profileGeneration)) return;
      notify("並び替えに失敗しました");
      onMoviesChange(rollbackMovies);
    } finally {
      if (orderingMutationIdRef.current === mutationId) {
        orderingRef.current = false;
        setIsOrdering(false);
      }
    }
  };

  const handleDragEnd = async () => {
    const dragContext = dragContextRef.current;
    if (
      draggedIndex === null ||
      !session ||
      orderingRef.current ||
      !dragContext
    )
      return;
    const movieIds = movies.map((m) => m.movie.id);
    dragContextRef.current = null;
    await updateServerOrder(
      movieIds,
      dragStartMoviesRef.current,
      dragContext.profileId,
      dragContext.generation,
    );
    setDraggedIndex(null);
  };

  const handleDrop = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
  };

  const handleMoveUp = async (index: number) => {
    if (
      index === 0 ||
      !session ||
      orderingRef.current ||
      membershipActionRef.current
    )
      return;
    const previousMovies = movies;
    const newMovies = [...movies];
    [newMovies[index - 1], newMovies[index]] = [
      newMovies[index],
      newMovies[index - 1],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(
      movieIds,
      previousMovies,
      selectedProfileId,
      profileGenerationRef.current,
    );
  };

  const handleMoveDown = async (index: number) => {
    if (
      index === movies.length - 1 ||
      !session ||
      orderingRef.current ||
      membershipActionRef.current
    )
      return;
    const previousMovies = movies;
    const newMovies = [...movies];
    [newMovies[index], newMovies[index + 1]] = [
      newMovies[index + 1],
      newMovies[index],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(
      movieIds,
      previousMovies,
      selectedProfileId,
      profileGenerationRef.current,
    );
  };

  const movieIdsInList = new Set(movies.map((item) => item.movie.id));

  return (
    <div className="movie-manager">
      <h3>動画一覧</h3>

      {/* Add Movie Section */}
      <div className="add-movie-section">
        <select
          aria-label="追加する動画を選択"
          value={selectedMovieId}
          onChange={(e) => setSelectedMovieId(e.target.value)}
          disabled={isLoadingMovies || isMembershipPending || isOrdering}
          className="movie-select"
        >
          <option value="">動画を選択...</option>
          {availableMovies
            .filter((movie) => !movieIdsInList.has(movie.id))
            .map((movie) => (
              <option key={movie.id} value={movie.id}>
                {movie.title}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={handleAddMovie}
          disabled={!selectedMovieId || isMembershipPending || isOrdering}
          className="add-btn"
        >
          {isAdding ? "追加中..." : "追加"}
        </button>
      </div>
      {hasMoreAvailableMovies && (
        <button
          type="button"
          onClick={() => void fetchAvailableMovies(availablePage + 1, true)}
          disabled={isLoadingMovies || isOrdering || isMembershipPending}
          className="add-btn"
        >
          {isLoadingMovies ? "読み込み中..." : "さらに読み込む"}
        </button>
      )}

      {/* Movies List */}
      {movies.length === 0 ? (
        <p className="no-movies">動画がありません</p>
      ) : (
        <ul className="movies-list">
          {movies.map((m, index) => (
            <li
              key={m.movie.id}
              className={`movie-item ${draggedIndex === index ? "dragging" : ""}`}
              draggable={!isOrdering && !isMembershipPending}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              <span className="movie-order">{index + 1}</span>
              <span className="movie-title">{m.movie.title}</span>
              <div className="movie-actions">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || isOrdering || isMembershipPending}
                  className="move-btn"
                  title="上へ"
                  aria-label={`${m.movie.title}を上へ移動`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={
                    index === movies.length - 1 ||
                    isOrdering ||
                    isMembershipPending
                  }
                  className="move-btn"
                  title="下へ"
                  aria-label={`${m.movie.title}を下へ移動`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveMovie(m.movie.id)}
                  disabled={isOrdering || isMembershipPending}
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
