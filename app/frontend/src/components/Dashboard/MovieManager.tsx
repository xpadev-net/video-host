import { useAtomValue } from "jotai";
import { type FC, useCallback, useEffect, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { client } from "@/lib/client";

interface Movie {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

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
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const [availableMovies, setAvailableMovies] = useState<Movie[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState<string>("");
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch available movies for selection
  const fetchAvailableMovies = useCallback(async () => {
    if (!token) return;
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
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      const allMovies = (json.data.items || []) as Movie[];
      // Filter out movies already in the list
      const movieIds = new Set(movies.map((m) => m.movie.id));
      setAvailableMovies(
        allMovies
          .filter((m) => !movieIds.has(m.id))
          .map((m) => ({
            ...m,
            thumbnailUrl: m.thumbnailUrl ?? undefined,
          })),
      );
    } catch {
      console.error("Failed to fetch movies");
    } finally {
      setIsLoadingMovies(false);
    }
  }, [token, selectedAccountId, movies]);

  useEffect(() => {
    fetchAvailableMovies();
  }, [fetchAvailableMovies]);

  const handleAddMovie = async () => {
    if (!selectedMovieId || !token) return;
    setIsAdding(true);
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies.$post(
              {
                param: { series: entityId },
                json: { movieId: selectedMovieId },
              },
              { headers: { Authorization: `Bearer ${token}` } },
            )
          : await client.api.v4.playlists[":playlist"].movies.$post(
              {
                param: { playlist: entityId },
                json: { movieId: selectedMovieId },
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );

      if (!res.ok) throw new Error("Failed to add");

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
      alert("動画の追加に失敗しました");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMovie = async (movieId: string) => {
    if (!token) return;
    try {
      const res =
        entityType === "series"
          ? await client.api.v4.series[":series"].movies[":movie"].$delete(
              {
                param: { series: entityId, movie: movieId },
              },
              { headers: { Authorization: `Bearer ${token}` } },
            )
          : await client.api.v4.playlists[":playlist"].movies[":movie"].$delete(
              {
                param: { playlist: entityId, movie: movieId },
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );

      if (!res.ok) throw new Error("Failed to remove");

      onMoviesChange(movies.filter((m) => m.movie.id !== movieId));
    } catch {
      alert("動画の削除に失敗しました");
    }
  };

  const handleDragStart = (index: number) => {
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

  const updateServerOrder = async (ids: string[]) => {
    if (!token) return;
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
              { headers: { Authorization: `Bearer ${token}` } },
            )
          : await client.api.v4.playlists[":playlist"].movies.$patch(
              {
                param: { playlist: entityId },
                json: {
                  movieIds: ids,
                },
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );
      if (!res.ok) throw new Error("Failed to update order");
    } catch {
      alert("並び替えに失敗しました");
      // Could revert here if needed
    }
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || !token) return;
    const movieIds = movies.map((m) => m.movie.id);
    await updateServerOrder(movieIds);
    setDraggedIndex(null);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0 || !token) return;
    const newMovies = [...movies];
    [newMovies[index - 1], newMovies[index]] = [
      newMovies[index],
      newMovies[index - 1],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(movieIds);
  };

  const handleMoveDown = async (index: number) => {
    if (index === movies.length - 1 || !token) return;
    const newMovies = [...movies];
    [newMovies[index], newMovies[index + 1]] = [
      newMovies[index + 1],
      newMovies[index],
    ];
    onMoviesChange(newMovies);
    const movieIds = newMovies.map((m) => m.movie.id);
    await updateServerOrder(movieIds);
  };

  return (
    <div className="movie-manager">
      <h3>動画一覧</h3>

      {/* Add Movie Section */}
      <div className="add-movie-section">
        <select
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
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === movies.length - 1}
                  className="move-btn"
                  title="下へ"
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
