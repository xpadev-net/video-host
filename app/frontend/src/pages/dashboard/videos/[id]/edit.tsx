import axios from "axios";
import { useAtomValue } from "jotai";
import Head from "next/head";
import { useRouter } from "next/router";
import { type FC, type FormEvent, useEffect, useState } from "react";
import type { FilteredMovie } from "@/@types/v4Api";
import { AuthTokenAtom } from "@/atoms/Auth";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

const EditVideoPage: FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const token = useAtomValue(AuthTokenAtom);

  const [movie, setMovie] = useState<FilteredMovie | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) return;

    const fetchMovie = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/v4/movies/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data.data;
        setMovie(data);
        setTitle(data.title);
        setDescription(data.description || "");
        setVisibility(data.visibility);
      } catch (_err) {
        setError("動画の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovie();
  }, [id, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await axios.patch(
        `${API_URL}/api/v4/movies/${id}`,
        {
          title: title.trim(),
          description: description.trim(),
          visibility,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      router.push("/dashboard/videos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );
  }

  if (!movie) {
    return (
      <DashboardLayout>
        <div>動画が見つかりません</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>動画を編集</title>
      </Head>
      <div className="edit-page">
        <h1>動画を編集</h1>
        <form onSubmit={handleSubmit} className="edit-form">
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
        .edit-page h1 {
          margin-bottom: 2rem;
          color: var(--text-primary, #fff);
        }
        .edit-form {
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
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
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
        .cancel-button:hover {
          background: var(--background-tertiary, #252525);
        }
        .submit-button {
          padding: 0.875rem 1.5rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
        }
        .submit-button:hover:not(:disabled) {
          background: #2563eb;
        }
        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </DashboardLayout>
  );
};

export default EditVideoPage;
