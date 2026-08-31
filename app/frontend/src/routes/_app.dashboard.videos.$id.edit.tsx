import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { type FormEvent, useEffect, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/videos/$id/edit")({
  head: () => ({ meta: [{ title: "動画を編集" }] }),
  component: EditVideoPage,
});

interface EncodeProgress {
  status: "queued" | "processing" | "retrying" | "completed" | "failed";
  progress?: number;
  queuePosition?: number;
  currentTime?: number;
  duration?: number;
}

function EditVideoPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const token = useAtomValue(AuthTokenAtom);

  const [movie, setMovie] = useState<FormattedMovie | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encodeProgress, setEncodeProgress] = useState<EncodeProgress | null>(
    null,
  );

  useEffect(() => {
    if (!token) return;

    const fetchMovie = async () => {
      try {
        const res = await client.api.v4.movies[":movie"].$get(
          {
            param: { movie: id },
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch");
        }

        const json = await res.json();
        // biome-ignore lint/suspicious/noExplicitAny: loose typing
        const movieData = json.data as any;
        setMovie(movieData);
        setTitle(movieData.title);
        setDescription(movieData.description || "");
        setVisibility(movieData.visibility);
      } catch {
        setError("動画の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovie();
  }, [id, token]);

  // SSE for encoding progress with authentication
  useEffect(() => {
    if (!movie || !token) return;

    const variant = movie.variants?.[0];
    if (!variant || variant.status !== "PROCESSING") {
      return;
    }

    // Use dynamic import to avoid SSR issues
    let controller: AbortController | null = null;

    const setupSSE = async () => {
      const { EventSourcePlus } = await import("event-source-plus");
      controller = new AbortController();

      const url = client.api.v4.progress[":movieId"]
        .$url({
          param: { movieId: id },
        })
        .toString();

      const eventSource = new EventSourcePlus(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      eventSource.listen({
        onMessage: (event) => {
          try {
            const data = JSON.parse(event.data) as EncodeProgress;
            setEncodeProgress(data);

            // Reload movie data when completed
            if (data.status === "completed" || data.status === "failed") {
              controller?.abort();
              // Refresh movie data
              client.api.v4.movies[":movie"]
                .$get(
                  {
                    param: { movie: id },
                  },
                  {
                    headers: { Authorization: `Bearer ${token}` },
                  },
                )
                .then(async (res) => {
                  if (res.ok) {
                    const json = await res.json();
                    // biome-ignore lint/suspicious/noExplicitAny: loose typing
                    setMovie(json.data as any);
                    setEncodeProgress(null);
                  }
                });
            }
          } catch (_e) {
            // ignore parse errors
          }
        },
        onResponseError: () => {
          controller?.abort();
        },
      });
    };

    setupSSE();

    return () => {
      controller?.abort();
    };
  }, [id, movie, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await client.api.v4.movies[":movie"].$patch(
        {
          param: { movie: id },
          json: {
            title: title.trim(),
            description: description.trim(),
            visibility,
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      await navigate({ to: "/dashboard/videos" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!movie) {
    return <div>動画が見つかりません</div>;
  }

  const variant = movie.variants?.[0];
  const isEncoding = variant?.status === "PROCESSING";

  return (
    <>
      <div className="edit-page">
        <h1>動画を編集</h1>

        {/* Encoding Progress Display */}
        {isEncoding && (
          <div className="encoding-progress" aria-live="polite">
            <div className="progress-header">
              <span className="progress-status">
                {encodeProgress?.status === "queued" && (
                  <>
                    ⏳ エンコード待ち
                    {encodeProgress.queuePosition &&
                      encodeProgress.queuePosition > 0 &&
                      ` (待ち順: ${encodeProgress.queuePosition}番目)`}
                  </>
                )}
                {encodeProgress?.status === "processing" && (
                  <>🔄 エンコード中 ({encodeProgress.progress ?? 0}%)</>
                )}
                {encodeProgress?.status === "retrying" && (
                  <>🔄 リトライ中... しばらくお待ちください</>
                )}
                {!encodeProgress && "🔄 エンコード中..."}
              </span>
            </div>
            {encodeProgress?.status === "processing" && (
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${encodeProgress.progress ?? 0}%` }}
                />
              </div>
            )}
            {encodeProgress?.currentTime !== undefined &&
              encodeProgress?.duration !== undefined && (
                <div className="progress-time">
                  {encodeProgress.currentTime}秒 / {encodeProgress.duration}秒
                </div>
              )}
          </div>
        )}

        {variant?.status === "FAILED" && (
          <div className="encode-failed">
            ❌
            エンコードに失敗しました。動画を削除して再度アップロードしてください。
          </div>
        )}

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
        .encoding-progress {
          padding: 1.5rem;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 12px;
          margin-bottom: 1.5rem;
          max-width: 600px;
        }
        .progress-header {
          margin-bottom: 0.75rem;
        }
        .progress-status {
          color: #3b82f6;
          font-weight: 500;
        }
        .progress-bar-container {
          height: 8px;
          background: rgba(59, 130, 246, 0.2);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        .progress-bar-fill {
          height: 100%;
          background: #3b82f6;
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        .progress-time {
          font-size: 0.875rem;
          color: var(--text-secondary, #999);
        }
        .encode-failed {
          padding: 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #ef4444;
          margin-bottom: 1.5rem;
          max-width: 600px;
        }
      `}</style>
    </>
  );
}
