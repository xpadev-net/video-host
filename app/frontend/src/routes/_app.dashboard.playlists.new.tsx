import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type FormEvent, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/playlists/new")({
  head: () => ({ meta: [{ title: "プレイリストを作成" }] }),
  component: NewPlaylistPage,
});

function NewPlaylistPage() {
  const navigate = useNavigate();
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const { data: user, isLoading } = useSelf();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await client.api.v4.playlists.$post(
        {
          json: {
            title: title.trim(),
            description: description.trim(),
            visibility,
            asUserId: selectedAccountId || undefined,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        throw new Error("作成に失敗しました");
      }

      await navigate({ to: "/dashboard/playlists" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <div>ログインしてください</div>;

  return (
    <>
      <div className="new-playlist-page">
        <h1>プレイリストを作成</h1>
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
          {error && <div className="error-message">{error}</div>}
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? "作成中..." : "作成"}
          </button>
        </form>
      </div>
      <style>{`
        .new-playlist-page h1 { margin-bottom: 2rem; color: var(--text-primary, #fff); }
        .form { max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem; }
        .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .form-group label { color: var(--text-secondary, #999); font-size: 0.875rem; }
        .form-group input, .form-group textarea, .form-group select { padding: 0.75rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 8px; color: var(--text-primary, #fff); font-size: 1rem; }
        .error-message { padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; color: #ef4444; }
        .submit-button { padding: 0.875rem 1.5rem; background: var(--primary-color, #3b82f6); color: white; border: none; border-radius: 8px; cursor: pointer; }
        .submit-button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </>
  );
}
