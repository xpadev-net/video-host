import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import type { FilteredUser, Visibility } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { Film } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useConfirm } from "@/components/Feedback/FeedbackProvider";
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
  const confirm = useConfirm();
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
  const uploadActiveRef = useRef(false);
  const uploadOperationRef = useRef(0);

  // Latest form values for the auto-save that fires when the upload lands;
  // the .then callback registered at file-select time would otherwise save
  // stale values and clobber whatever the user typed while uploading.
  const metadataRef = useRef({ title, description, visibility, viewers });
  useEffect(() => {
    metadataRef.current = { title, description, visibility, viewers };
  }, [title, description, visibility, viewers]);
  const movieIdRef = useRef<string | null>(null);
  useEffect(() => {
    movieIdRef.current = movieId;
  }, [movieId]);

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
    shouldBlockFn: async () =>
      !(await confirm({
        title: "アップロード中です",
        description: "このページを離れると進行中のアップロードが中断されます。",
        confirmLabel: "ページを離れる",
        destructive: true,
      })),
    enableBeforeUnload: needsLeaveGuard,
    disabled: !needsLeaveGuard,
  });

  const doSaveMetadata = async (): Promise<boolean> => {
    const id = movieIdRef.current;
    const current = metadataRef.current;
    if (!id) return false;
    if (!current.title.trim()) {
      setError("タイトルを入力してから保存してください");
      return false;
    }
    const submitted = {
      title: current.title.trim(),
      description: current.description.trim(),
      visibility: current.visibility,
      viewerIds: current.viewers.map((viewer) => viewer.id),
    };
    const res = await client.api.v4.movies[":movie"].$patch({
      param: { movie: id },
      json: submitted,
    });
    if (!res.ok) {
      throw new Error("メタデータの保存に失敗しました");
    }
    const latest = metadataRef.current;
    setSaved(
      submitted.title === latest.title.trim() &&
        submitted.description === latest.description.trim() &&
        submitted.visibility === latest.visibility &&
        submitted.viewerIds.join("\0") ===
          latest.viewers.map((viewer) => viewer.id).join("\0"),
    );
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
    const input = e.currentTarget;
    const selectedFile = e.target.files?.[0];
    input.value = "";
    if (!selectedFile || uploadActiveRef.current || savePending) return;
    uploadActiveRef.current = true;
    const operation = ++uploadOperationRef.current;

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
      uploadActiveRef.current = false;
      return; // uploadState.error is shown below
    }

    movieIdRef.current = result.movieId;
    setMovieId(result.movieId);
    metadataRef.current = { ...metadataRef.current, title: result.title };
    setTitle(result.title);

    // Upload in the background; when it lands, persist the metadata the user
    // has typed so far and queue the encode. savePending keeps the leave
    // guard armed until the save resolves — an in-flight PATCH dies with the
    // page and the movie would stay PRIVATE.
    void upload(result.movieId, result.uploadUrl, selectedFile)
      .then(async (succeeded) => {
        if (succeeded) {
          setSavePending(true);
          try {
            await saveMetadata();
          } catch {
            setError(
              "メタデータの保存に失敗しました。「保存」で再度お試しください",
            );
          } finally {
            setSavePending(false);
          }
        }
      })
      .finally(() => {
        if (operation === uploadOperationRef.current) {
          uploadActiveRef.current = false;
        }
      });
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

  const preventLeavingWithUnsavedChanges = (
    e: MouseEvent<HTMLAnchorElement>,
  ) => {
    if (saved && !savePending && !isSaving) return;
    e.preventDefault();
    setError("変更を保存してから移動してください");
  };

  const handleRetryUpload = async () => {
    if (!file || uploadActiveRef.current || savePending) return;
    uploadActiveRef.current = true;
    const operation = ++uploadOperationRef.current;
    setError(null);
    try {
      const succeeded = movieId
        ? await resume(movieId, file)
        : await (async () => {
            const result = await init(file, {
              asUserId: selectedAccountId || undefined,
            });
            if (!result) return false;
            movieIdRef.current = result.movieId;
            setMovieId(result.movieId);
            metadataRef.current = {
              ...metadataRef.current,
              title: result.title,
            };
            setTitle(result.title);
            return upload(result.movieId, result.uploadUrl, file);
          })();
      if (succeeded) {
        setSavePending(true);
        try {
          await saveMetadata();
        } catch {
          setError(
            "メタデータの保存に失敗しました。「保存」で再度お試しください",
          );
        } finally {
          setSavePending(false);
        }
      }
    } finally {
      if (operation === uploadOperationRef.current) {
        uploadActiveRef.current = false;
      }
    }
  };

  const handleCancelUpload = async () => {
    // Once the upload PUT has landed the server is completing/enqueuing the
    // encode; deleting the movie here would race that completion, so cancel
    // is only offered while bytes are still in flight.
    if (uploadState.phase !== "uploading") return;
    if (!cancel()) return;
    uploadOperationRef.current += 1;
    if (movieId) {
      // Discard the record created for this upload; a leftover UPLOADING
      // movie would sit in the dashboard forever otherwise.
      await client.api.v4.movies[":movie"]
        .$delete({ param: { movie: movieId } })
        .catch(() => {});
    }
    setFile(null);
    setMovieId(null);
    movieIdRef.current = null;
    setTitle("");
    setDescription("");
    resetUpload();
    uploadActiveRef.current = false;
  };

  const handleStartNextUpload = () => {
    if (savePending || uploadActiveRef.current) return;
    resetUpload();
    setFile(null);
    setMovieId(null);
    movieIdRef.current = null;
    setTitle("");
    setDescription("");
    setVisibility("PUBLIC");
    setViewers([]);
    setSaved(false);
    setError(null);
    fileInputRef.current?.click();
  };

  if (isUserLoading) {
    return <DashboardLoading />;
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
                    <Film aria-hidden="true" className="file-icon" />
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
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            id="video-file"
            type="file"
            accept="video/*"
            onChange={(e) => void handleFileChange(e)}
            disabled={isBusy || savePending}
            hidden
          />

          {movieId && isBusy && (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">
                {uploadState.phase === "uploading" &&
                  `アップロード中 (${uploadState.progress}%)`}
                {(uploadState.phase === "creating" ||
                  uploadState.phase === "completing") &&
                  "アップロード処理中..."}
              </div>
              <div className="relative h-2 overflow-hidden rounded bg-background">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              {uploadState.phase === "uploading" && (
                <button
                  type="button"
                  className="self-start cursor-pointer rounded-md border border-border bg-transparent px-3.5 py-1.5 text-[0.8rem] text-muted-foreground hover:border-[#ef4444] hover:text-[#ef4444]"
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
                  onClick={preventLeavingWithUnsavedChanges}
                >
                  動画ページへ
                </Link>
                <Link
                  to="/dashboard/videos"
                  className="font-medium text-green-500"
                  onClick={preventLeavingWithUnsavedChanges}
                >
                  動画一覧へ
                </Link>
                <button
                  type="button"
                  className="font-medium text-green-500"
                  onClick={handleStartNextUpload}
                  disabled={savePending || isSaving || !saved}
                >
                  次の動画をアップロード
                </button>
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
                    const nextTitle = e.target.value;
                    metadataRef.current = {
                      ...metadataRef.current,
                      title: nextTitle,
                    };
                    setTitle(nextTitle);
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
                    const nextDescription = e.target.value;
                    metadataRef.current = {
                      ...metadataRef.current,
                      description: nextDescription,
                    };
                    setDescription(nextDescription);
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
                    const nextVisibility = e.target.value as Visibility;
                    metadataRef.current = {
                      ...metadataRef.current,
                      visibility: nextVisibility,
                    };
                    setVisibility(nextVisibility);
                    setSaved(false);
                  }}
                >
                  <option value="PUBLIC">公開</option>
                  <option value="UNLISTED">限定公開</option>
                  <option value="LIMITED">指定ユーザー公開</option>
                  <option value="PRIVATE">非公開</option>
                </select>
                <p className="m-0 text-[0.8rem] text-muted-foreground">
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
                      metadataRef.current = {
                        ...metadataRef.current,
                        viewers: next,
                      };
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
    </>
  );
}
