import axios from "axios";
import { useAtomValue } from "jotai";
import Head from "next/head";
import { useRouter } from "next/router";
import { type FC, type FormEvent, useEffect, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

interface Movie {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

interface PlaylistMovie {
  movie: Movie;
  order: number;
}

const EditPlaylistPage: FC = () => {
  const router = useRouter();
  const { id } = router.query;
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
    if (!id || !token) return;
    const fetchPlaylist = async () => {
      try {
        const res = await axios.get(`${API_URL}playlists/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data.data;
        setTitle(data.title);
        setDescription(data.description || "");
        setVisibility(data.visibility);
        setMovies(data.movies || []);
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
    if (!id || !title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await axios.patch(
        `${API_URL}playlists/${id}`,
        { title: title.trim(), description: description.trim(), visibility },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      router.push("/dashboard/playlists");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      setIsSubmitting(false);
    }
  };

  const handleRemoveMovie = async (movieId: string) => {
    try {
      await axios.delete(`${API_URL}playlists/${id}/movies/${movieId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMovies((prev) => prev.filter((m) => m.movie.id !== movieId));
    } catch {
      alert("動画の削除に失敗しました");
    }
  };

  if (isLoading)
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <Head>
        <title>プレイリストを編集</title>
      </Head>
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

          <div className="movies-section">
            <h3>動画一覧</h3>
            {movies.length === 0 ? (
              <p className="no-movies">動画がありません</p>
            ) : (
              <div className="movies-list">
                {movies.map((m) => (
                  <div key={m.movie.id} className="movie-item">
                    <span>{m.movie.title}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMovie(m.movie.id)}
                      className="remove-btn"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => router.back()}
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
      <style jsx>{`
        .edit-playlist-page h1 { margin-bottom: 2rem; color: var(--text-primary, #fff); }
        .form { max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .form-group label { color: var(--text-secondary, #999); font-size: 0.875rem; }
        .form-group input, .form-group textarea, .form-group select { padding: 0.75rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 8px; color: var(--text-primary, #fff); font-size: 1rem; }
        .movies-section h3 { color: var(--text-primary, #fff); margin-bottom: 1rem; }
        .no-movies { color: var(--text-secondary, #999); }
        .movies-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .movie-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 8px; color: var(--text-primary, #fff); }
        .remove-btn { padding: 0.25rem 0.5rem; background: transparent; border: 1px solid #ef4444; border-radius: 4px; color: #ef4444; cursor: pointer; font-size: 0.75rem; }
        .error-message { padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; color: #ef4444; }
        .form-actions { display: flex; gap: 1rem; }
        .cancel-button { padding: 0.875rem 1.5rem; background: transparent; border: 1px solid var(--border-color, #333); border-radius: 8px; color: var(--text-primary, #fff); cursor: pointer; }
        .submit-button { padding: 0.875rem 1.5rem; background: var(--primary-color, #3b82f6); color: white; border: none; border-radius: 8px; cursor: pointer; }
        .submit-button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </DashboardLayout>
  );
};

export default EditPlaylistPage;
