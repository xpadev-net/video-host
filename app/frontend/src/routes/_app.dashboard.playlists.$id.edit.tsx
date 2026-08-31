import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type FormEvent, useEffect, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { MovieManager } from "@/components/Dashboard/MovieManager";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/playlists/$id/edit")({
  head: () => ({ meta: [{ title: "プレイリストを編集" }] }),
  component: EditPlaylistPage,
});

interface Movie {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

interface PlaylistMovie {
  movie: Movie;
  order: number;
}

function EditPlaylistPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const token = useAtomValue(AuthTokenAtom);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [movies, setMovies] = useState<PlaylistMovie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchPlaylist = async () => {
      try {
        const res = await client.api.v4.playlists[":playlist"].$get(
          {
            param: { playlist: id },
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) throw new Error("Failed to fetch");

        const json = await res.json();
        const data = json.data;
        setTitle(data.title);
        setDescription(data.description || "");
        setVisibility(data.visibility);
        // Assuming backend returns matching structure.
        const playlistMovies: PlaylistMovie[] = (data.movies || []).map(
          (m: unknown, index: number) => ({
            movie: m as Movie,
            order: index + 1,
          }),
        );
        setMovies(playlistMovies);
      } catch {
        setError("プレイリストの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
  }, [id, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await client.api.v4.playlists[":playlist"].$patch(
        {
          param: { playlist: id },
          json: {
            title: title.trim(),
            description: description.trim(),
            visibility,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) throw new Error("Failed to update");

      await navigate({ to: "/dashboard/playlists" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <div className="edit-playlist-page">
        <h1>プレイリストを編集</h1>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="title">タイトル</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">説明</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="form-group">
            <label htmlFor="visibility">公開設定</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as "PUBLIC" | "UNLISTED" | "PRIVATE",
                )
              }
            >
              <option value="PUBLIC">公開</option>
              <option value="UNLISTED">限定公開</option>
              <option value="PRIVATE">非公開</option>
            </select>
          </div>

          <MovieManager
            entityType="playlist"
            entityId={id}
            movies={movies}
            onMoviesChange={setMovies}
          />

          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => router.history.back()}
              className="cancel-button"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="submit-button"
            >
              {isSubmitting ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
      <style>{`
        .edit-playlist-page h1 {
          margin-bottom: 2rem;
          color: var(--text-primary, #fff);
        }
        .form {
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
          padding: 0.75rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #fff);
          font-size: 1rem;
        }
        .error-message {
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #ef4444;
        }
        .form-actions {
          display: flex;
          gap: 1rem;
        }
        .cancel-button {
          padding: 0.875rem 1.5rem;
          background: transparent;
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #fff);
          cursor: pointer;
        }
        .submit-button {
          padding: 0.875rem 1.5rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
