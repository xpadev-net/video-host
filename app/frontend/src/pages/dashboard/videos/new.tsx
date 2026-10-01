import type { FilteredUser, Visibility } from "@video-host/backend";
import { useAtomValue } from "jotai";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  type ChangeEvent,
  type FC,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { UserPicker } from "@/components/UserPicker/UserPicker";
import { useUpload } from "@/hooks/useUpload";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

const NewVideoPage: FC = () => {
  const token = useAtomValue(AuthTokenAtom);
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
  const router = useRouter();
  const needsLeaveGuard = isBusy || savePending;
  useEffect(() => {
    if (!needsLeaveGuard) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const handleRouteChange = () => {
      if (!window.confirm("アップロード中です。このページを離れますか？")) {
        router.events.emit("routeChangeError");
        // Next.js pages-router: throwing here aborts the route change.
        throw "routeChange aborted";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [needsLeaveGuard, router]);

  const saveMetadata = async (): Promise<boolean> => {
    const id = movieIdRef.current;
    const current = metadataRef.current;
    if (!id || !current.title.trim()) return false;
    const res = await client.api.v4.movies[":movie"].$patch(
      {
        param: { movie: id },
        json: {
          title: current.title.trim(),
          description: current.description.trim(),
          visibility: current.visibility,
          viewerIds: current.viewers.map((viewer) => viewer.id),
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      throw new Error("Failed to update");
    }
    setSaved(true);
    return true;
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
    cancel();
    if (movieId) {
      // Discard the record created for this upload; a leftover UPLOADING
      // movie would sit in the dashboard forever otherwise.
      await client.api.v4.movies[":movie"]
        .$delete(
          { param: { movie: movieId } },
          { headers: { Authorization: `Bearer ${token}` } },
        )
        .catch(() => {});
    }
    setFile(null);
    setMovieId(null);
    setTitle("");
    setDescription("");
    resetUpload();
  };

  if (isUserLoading) {
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div>ログインしてください</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>動画をアップロード</title>
      </Head>
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
            <div className="upload-progress">
              <div className="progress-status">
                {uploadState.phase === "uploading" &&
                  `アップロード中 (${uploadState.progress}%)`}
                {(uploadState.phase === "creating" ||
                  uploadState.phase === "completing") &&
                  "アップロード処理中..."}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <button
                type="button"
                className="cancel-upload-button"
                onClick={() => void handleCancelUpload()}
              >
                アップロードをキャンセル
              </button>
            </div>
          )}

          {isDone && (
            <div className="upload-done" aria-live="polite">
              アップロードが完了しました。エンコードはバックグラウンドで継続さ
              れます。このページを離れても問題ありません。
              <div className="done-actions">
                <Link
                  href={`/dashboard/videos/${movieId}/edit`}
                  className="done-link"
                >
                  動画ページへ
                </Link>
                <Link href="/dashboard/videos" className="done-link">
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
                className="retry-button"
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
                <p className="visibility-note">
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
      <style jsx>{`
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
        .upload-progress {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .progress-status {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .progress-bar {
          position: relative;
          height: 8px;
          background: var(--background-primary, #0d0d0d);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary-color, #3b82f6);
          transition: width 0.3s;
        }
        .cancel-upload-button {
          align-self: flex-start;
          padding: 0.4rem 0.9rem;
          background: transparent;
          border: 1px solid var(--border-color, #333);
          border-radius: 6px;
          color: var(--text-secondary, #999);
          font-size: 0.8rem;
          cursor: pointer;
        }
        .cancel-upload-button:hover {
          border-color: #ef4444;
          color: #ef4444;
        }
        .upload-done {
          padding: 1rem 1.25rem;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.4);
          border-radius: 8px;
          color: #22c55e;
        }
        .done-actions {
          display: flex;
          gap: 1rem;
          margin-top: 0.75rem;
        }
        .done-link {
          color: #22c55e;
          font-weight: 500;
        }
        .visibility-note {
          margin: 0;
          color: var(--text-secondary, #999);
          font-size: 0.8rem;
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
        .retry-button {
          padding: 0.4rem 0.9rem;
          background: transparent;
          border: 1px solid #ef4444;
          border-radius: 6px;
          color: #ef4444;
          font-size: 0.8rem;
          cursor: pointer;
          flex-shrink: 0;
        }
        .retry-button:hover {
          background: rgba(239, 68, 68, 0.15);
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
    </DashboardLayout>
  );
};

export default NewVideoPage;
