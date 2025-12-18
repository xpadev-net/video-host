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
      const allMovies = json.data.items || [];
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

      <style jsx>{`
        .movie-manager {
          margin-top: 1.5rem;
        }
        .movie-manager h3 {
          color: var(--text-primary, #fff);
          margin-bottom: 1rem;
        }
        .add-movie-section {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .movie-select {
          flex: 1;
          padding: 0.5rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 6px;
          color: var(--text-primary, #fff);
        }
        .add-btn {
          padding: 0.5rem 1rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .add-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .no-movies {
          color: var(--text-secondary, #999);
        }
        .movies-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .movie-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #fff);
          cursor: grab;
          transition: all 0.2s;
        }
        .movie-item:hover {
          border-color: var(--primary-color, #3b82f6);
        }
        .movie-item.dragging {
          opacity: 0.5;
          border-style: dashed;
        }
        .movie-order {
          width: 24px;
          text-align: center;
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .movie-title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .movie-actions {
          display: flex;
          gap: 0.25rem;
        }
        .move-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: transparent;
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-size: 0.875rem;
        }
        .move-btn:hover:not(:disabled) {
          color: var(--text-primary, #fff);
          border-color: var(--text-primary, #fff);
        }
        .move-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .remove-btn {
          padding: 0.25rem 0.5rem;
          background: transparent;
          border: 1px solid #ef4444;
          border-radius: 4px;
          color: #ef4444;
          cursor: pointer;
          font-size: 0.75rem;
        }
        .remove-btn:hover {
          background: rgba(239, 68, 68, 0.1);
        }
      `}</style>
    </div>
  );
};
