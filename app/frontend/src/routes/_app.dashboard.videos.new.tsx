import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import type { FilteredUser, Visibility } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { UserPicker } from "@/components/UserPicker/UserPicker";
import { useUpload } from "@/hooks/useUpload";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/videos/new")({
  head: () => ({ meta: [{ title: "動画をアップロード" }] }),
  component: NewVideoPage,
});

function NewVideoPage() {
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const { data: user, isLoading: isUserLoading } = useSelf();
  const {
    init,
    upload,
    resume,
    cancel,
    state: uploadState,
    reset: resetUpload,
  } = useUpload();

  const [file, setFile] = useState<File | null>(null);
  const [movieId, setMovieId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [viewers, setViewers] = useState<FilteredUser[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Latest form values for the auto-save that fires when the upload lands;
  // the .then callback registered at file-select time would otherwise save
  // stale values and clobber whatever the user typed while uploading.
  const metadataRef = useRef({ title, description, visibility, viewers });
  metadataRef.current = { title, description, visibility, viewers };
  const movieIdRef = useRef<string | null>(null);
  movieIdRef.current = movieId;

  const isBusy =
    uploadState.phase === "creating" ||
    uploadState.phase === "uploading" ||
    uploadState.phase === "completing";
  const isDone = uploadState.phase === "done";

  // Warn before leaving while the upload (or the trailing metadata save) is
  // in flight; once it lands, the encode keeps running server-side and leaving
  // is safe. beforeunload only covers real navigation, so client-side route
  // changes need their own confirm gate.
  const needsLeaveGuard = isBusy || savePending;
  useBlocker({
    shouldBlockFn: () =>
      !window.confirm("アップロード中です。このページを離れますか？"),
    enableBeforeUnload: needsLeaveGuard,
    disabled: !needsLeaveGuard,
  });

  const doSaveMetadata = async (): Promise<boolean> => {
    const id = movieIdRef.current;
    const current = metadataRef.current;
    if (!id || !current.title.trim()) return false;
    const res = await client.api.v4.movies[":movie"].$patch({
      param: { movie: id },
      json: {
        title: current.title.trim(),
        description: current.description.trim(),
        visibility: current.visibility,
        viewerIds: current.viewers.map((viewer) => viewer.id),
      },
    });
    if (!res.ok) {
      throw new Error("Failed to update");
    }
    setSaved(true);
    return true;
  };

  // Serialize PATCHes: a manual save overlapping the upload-complete
  // auto-save could otherwise land first and let the stale request finish
  // last, silently reverting the user's newest edits.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveMetadata = (): Promise<boolean> => {
    const task = saveQueueRef.current.then(() => doSaveMetadata());
    saveQueueRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setMovieId(null);
    setSaved(false);
    setError(null);
    resetUpload();

    // Create the movie record as soon as the file is picked, YouTube-style:
    // metadata below is already editable while the upload progresses.
    const result = await init(selectedFile, {
      asUserId: selectedAccountId || undefined,
    });
    if (!result) {
      return; // uploadState.error is shown below
    }

    setMovieId(result.movieId);
    setTitle(result.title);

    // Upload in the background; when it lands, persist the metadata the user
    // has typed so far and queue the encode. savePending keeps the leave
    // guard armed until the save resolves — an in-flight PATCH dies with the
    // page and the movie would stay PRIVATE.
    void upload(result.movieId, result.uploadUrl, selectedFile).then(
      (succeeded) => {
        if (succeeded) {
          setSavePending(true);
          void saveMetadata()
            .catch(() => {
              setError(
                "メタデータの保存に失敗しました。「保存」で再度お試しください",
              );
            })
            .finally(() => setSavePending(false));
        }
      },
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!movieId || !title.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      await saveMetadata();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!file) return;
    setError(null);
    const succeeded = movieId
      ? await resume(movieId, file)
      : await (async () => {
          const result = await init(file, {
            asUserId: selectedAccountId || undefined,
          });
          if (!result) return false;
          setMovieId(result.movieId);
          setTitle(result.title);
          return upload(result.movieId, result.uploadUrl, file);
        })();
    if (succeeded) {
      setSavePending(true);
      void saveMetadata()
        .catch(() => {
          setError(
            "メタデータの保存に失敗しました。「保存」で再度お試しください",
          );
        })
        .finally(() => setSavePending(false));
    }
  };

  const handleCancelUpload = async () => {
    // Once the upload PUT has landed the server is completing/enqueuing the
    // encode; deleting the movie here would race that completion, so cancel
    // is only offered while bytes are still in flight.
    if (uploadState.phase !== "uploading") return;
    cancel();
    if (movieId) {
      // Discard the record created for this upload; a leftover UPLOADING
      // movie would sit in the dashboard forever otherwise.
      await client.api.v4.movies[":movie"]
        .$delete({ param: { movie: movieId } })
        .catch(() => {});
    }
    setFile(null);
    setMovieId(null);
    setTitle("");
    setDescription("");
    resetUpload();
  };

  if (isUserLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>ログインしてください</div>;
  }

  return (
    <>
      <div className="upload-page">
        <h1>動画をアップロード</h1>
        <form onSubmit={handleSubmit} className="upload-form">
          {!movieId || isBusy ? (
            <div className="form-group">
              <label htmlFor="video-file">動画ファイル</label>
              <button
                type="button"
                className="file-drop-zone"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                {file ? (
                  <div className="file-info">
                    <span className="file-icon">🎬</span>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                ) : (
                  <div className="file-placeholder">
                    <span>クリックして動画を選択</span>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(e) => void handleFileChange(e)}
                hidden
              />
            </div>
          ) : null}

          {movieId && isBusy && (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-[color:var(--text-secondary,#999)]">
                {uploadState.phase === "uploading" &&
                  `アップロード中 (${uploadState.progress}%)`}
                {(uploadState.phase === "creating" ||
                  uploadState.phase === "completing") &&
                  "アップロード処理中..."}
              </div>
              <div className="relative h-2 overflow-hidden rounded bg-[var(--background-primary,#0d0d0d)]">
                <div
                  className="h-full bg-[var(--primary-color,#3b82f6)] transition-[width]"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              {uploadState.phase === "uploading" && (
                <button
                  type="button"
                  className="self-start cursor-pointer rounded-md border border-[var(--border-color,#333)] bg-transparent px-3.5 py-1.5 text-[0.8rem] text-[color:var(--text-secondary,#999)] hover:border-[#ef4444] hover:text-[#ef4444]"
                  onClick={() => void handleCancelUpload()}
                >
                  アップロードをキャンセル
                </button>
              )}
            </div>
          )}

          {isDone && (
            <div
              className="rounded-lg border border-green-500/40 bg-green-500/10 px-5 py-4 text-green-500"
              aria-live="polite"
            >
              アップロードが完了しました。エンコードはバックグラウンドで継続さ
              れます。このページを離れても問題ありません。
              <div className="mt-3 flex gap-4">
                <Link
                  to="/dashboard/videos/$id/edit"
                  params={{ id: movieId ?? "" }}
                  className="font-medium text-green-500"
                >
                  動画ページへ
                </Link>
                <Link
                  to="/dashboard/videos"
                  className="font-medium text-green-500"
                >
                  動画一覧へ
                </Link>
              </div>
            </div>
          )}

          {uploadState.phase === "error" && (
            <div className="error-message">
              {uploadState.error ?? "アップロードに失敗しました"}
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-md border border-[#ef4444] bg-transparent px-3.5 py-1.5 text-[0.8rem] text-[#ef4444] hover:bg-[rgba(239,68,68,0.15)]"
                onClick={() => void handleRetryUpload()}
              >
                再試行
              </button>
            </div>
          )}

          {movieId && (
            <>
              <div className="form-group">
                <label htmlFor="title">タイトル</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="動画のタイトルを入力"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">説明</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="動画の説明を入力（任意）"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label htmlFor="visibility">公開設定</label>
                <select
                  id="visibility"
                  value={visibility}
                  onChange={(e) => {
                    setVisibility(e.target.value as Visibility);
                    setSaved(false);
                  }}
                >
                  <option value="PUBLIC">公開</option>
                  <option value="UNLISTED">限定公開</option>
                  <option value="LIMITED">指定ユーザー公開</option>
                  <option value="PRIVATE">非公開</option>
                </select>
                <p className="m-0 text-[0.8rem] text-[color:var(--text-secondary,#999)]">
                  エンコードが完了するまでは設定に関わらず非公開になります
                </p>
              </div>

              {visibility === "LIMITED" && (
                <div className="form-group">
                  <label htmlFor="viewers">公開するユーザー</label>
                  <UserPicker
                    id="viewers"
                    selected={viewers}
                    onChange={(next) => {
                      setViewers(next);
                      setSaved(false);
                    }}
                  />
                </div>
              )}

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button
                  type="submit"
                  disabled={!title.trim() || isSaving}
                  className="submit-button"
                >
                  {isSaving ? "保存中..." : saved ? "保存済み" : "保存"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      <style>{`
        .upload-page h1 {
          margin-bottom: 2rem;
          color: var(--text-primary, #fff);
        }
        .upload-form {
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
        .file-drop-zone {
          padding: 2rem;
          border: 2px dashed var(--border-color, #333);
          border-radius: 12px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .file-drop-zone:hover:not(:disabled) {
          border-color: var(--primary-color, #3b82f6);
        }
        .file-drop-zone:disabled {
          opacity: 0.7;
          cursor: default;
        }
        .file-placeholder {
          color: var(--text-secondary, #999);
        }
        .file-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .file-icon {
          font-size: 1.5rem;
        }
        .file-name {
          color: var(--text-primary, #fff);
        }
        .file-size {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .error-message {
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .form-actions {
          display: flex;
          gap: 1rem;
          align-items: center;
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
          transition: all 0.2s;
        }
        .submit-button:hover:not(:disabled) {
          background: #2563eb;
        }
        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
