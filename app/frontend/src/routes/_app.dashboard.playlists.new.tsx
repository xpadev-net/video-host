import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/playlists/new")({
  head: () => ({ meta: [{ title: "プレイリストを作成" }] }),
  component: NewPlaylistPage,
});

function NewPlaylistPage() {
  const navigate = useNavigate();
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const { data: user, isLoading } = useSelf();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSelectionRef = useRef({ selectedAccountId, selectedProfileId });
  const selectionGenerationRef = useRef(0);
  const submissionIdRef = useRef(0);
  const currentSelectionRef = useRef({ selectedAccountId, selectedProfileId });
  if (
    currentSelectionRef.current.selectedAccountId !== selectedAccountId ||
    currentSelectionRef.current.selectedProfileId !== selectedProfileId
  ) {
    currentSelectionRef.current = { selectedAccountId, selectedProfileId };
    selectionGenerationRef.current += 1;
  }

  useEffect(() => {
    if (
      previousSelectionRef.current.selectedAccountId === selectedAccountId &&
      previousSelectionRef.current.selectedProfileId === selectedProfileId
    )
      return;
    previousSelectionRef.current = { selectedAccountId, selectedProfileId };
    setTitle("");
    setDescription("");
    setVisibility("PUBLIC");
    setError(null);
    setIsSubmitting(false);
  }, [selectedAccountId, selectedProfileId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const selectionGeneration = selectionGenerationRef.current;
    const submissionId = ++submissionIdRef.current;

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
        {
          headers: { "X-Profile-Id": selectedProfileId ?? "" },
        },
      );

      if (!res.ok) {
        throw new Error("作成に失敗しました");
      }

      if (selectionGenerationRef.current === selectionGeneration)
        await navigate({ to: "/dashboard/playlists" });
    } catch (err) {
      if (selectionGenerationRef.current === selectionGeneration)
        setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      if (submissionIdRef.current === submissionId) setIsSubmitting(false);
    }
  };

  if (isLoading) return <DashboardLoading />;
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
    </>
  );
}
