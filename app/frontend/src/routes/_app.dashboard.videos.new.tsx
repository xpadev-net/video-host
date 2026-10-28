import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import type { Visibility } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { Film } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useConfirm } from "@/components/Feedback/FeedbackProvider";
import { useUpload } from "@/hooks/useUpload";
import { useSelf } from "@/hooks/useUser";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/videos/new")({
  head: () => ({ meta: [{ title: "動画をアップロード" }] }),
  component: NewVideoPage,
});

function NewVideoPage() {
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const confirm = useConfirm();
  const { data: user, isLoading: isUserLoading } = useSelf();
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
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
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelDeleteFailed, setCancelDeleteFailed] = useState(false);
  const [cancelDeletePending, setCancelDeletePending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadActiveRef = useRef(false);
  const uploadOperationRef = useRef(0);
  const cancelDeleteMovieIdRef = useRef<string | null>(null);
  const movieProfileIdRef = useRef<string | null>(null);
  const movieSessionUserIdRef = useRef<string | null>(null);
  const currentSessionUserIdRef = useRef(sessionUserId);

  // Latest form values for the auto-save that fires when the upload lands;
  // the .then callback registered at file-select time would otherwise save
  // stale values and clobber whatever the user typed while uploading.
  const metadataRef = useRef({ title, description, visibility });
  useEffect(() => {
    metadataRef.current = { title, description, visibility };
  }, [title, description, visibility]);
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
  const needsLeaveGuard = isBusy || savePending || cancelDeletePending;
  useBlocker({
    shouldBlockFn: async () =>
      !(await confirm({
        title: "アップロード中です",
        description: cancelDeletePending
          ? "アップロード記録の削除が完了するまでページを離れないでください。"
          : "このページを離れると進行中のアップロードが中断されます。",
        confirmLabel: "ページを離れる",
        destructive: true,
      })),
    enableBeforeUnload: needsLeaveGuard,
    disabled: !needsLeaveGuard,
  });

  const doSaveMetadata = async (): Promise<boolean> => {
    const id = movieIdRef.current;
    const sessionId = movieSessionUserIdRef.current;
    const current = metadataRef.current;
    if (!id) return false;
    if (!sessionId || sessionId !== currentSessionUserIdRef.current) {
      throw new Error(
        "ログイン状態が変わりました。アップロードをやり直してください",
      );
    }
    if (!current.title.trim()) {
      setError("タイトルを入力してから保存してください");
      return false;
    }
    const submitted = {
      title: current.title.trim(),
      description: current.description.trim(),
      visibility: current.visibility,
    };
    const res = await client.api.v4.movies[":movie"].$patch(
      {
        param: { movie: id },
        json: submitted,
      },
      { headers: { "X-Profile-Id": movieProfileIdRef.current ?? "" } },
    );
    if (!res.ok) {
      throw new Error("メタデータの保存に失敗しました");
    }
    if (currentSessionUserIdRef.current !== sessionId) return false;
    const latest = metadataRef.current;
    setSaved(
      submitted.title === latest.title.trim() &&
        submitted.description === latest.description.trim() &&
        submitted.visibility === latest.visibility,
    );
    return true;
  };

  // Serialize PATCHes: a manual save overlapping the upload-complete
  // auto-save could otherwise land first and let the stale request finish
  // last, silently reverting the user's newest edits.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => {
    if (currentSessionUserIdRef.current === sessionUserId) return;
    currentSessionUserIdRef.current = sessionUserId;
    cancel();
    resetUpload();
    uploadOperationRef.current += 1;
    uploadActiveRef.current = false;
    movieIdRef.current = null;
    movieProfileIdRef.current = null;
    movieSessionUserIdRef.current = null;
    cancelDeleteMovieIdRef.current = null;
    saveQueueRef.current = Promise.resolve();
    setFile(null);
    setMovieId(null);
    setTitle("");
    setDescription("");
    setVisibility("PUBLIC");
    setIsSaving(false);
    setSaved(false);
    setSavePending(false);
    setCancelDeleteFailed(false);
    setCancelDeletePending(false);
    setError(null);
  }, [sessionUserId, cancel, resetUpload]);

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
    const startingSessionId = currentSessionUserIdRef.current;
    if (!startingSessionId) return;
    uploadActiveRef.current = true;
    const operation = ++uploadOperationRef.current;

    setFile(selectedFile);
    setMovieId(null);
    movieIdRef.current = null;
    movieProfileIdRef.current = null;
    movieSessionUserIdRef.current = null;
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
    if (currentSessionUserIdRef.current !== startingSessionId) return;

    movieIdRef.current = result.movieId;
    setMovieId(result.movieId);
    movieProfileIdRef.current = result.profileId;
    movieSessionUserIdRef.current = startingSessionId;
    metadataRef.current = { ...metadataRef.current, title: result.title };
    setTitle(result.title);

    // Upload in the background; when it lands, persist the metadata the user
    // has typed so far and queue the encode. savePending keeps the leave
    // guard armed until the save resolves — an in-flight PATCH dies with the
    // page and the movie would stay PRIVATE.
    void upload(result.movieId, result.uploadUrl, selectedFile)
      .then(async (succeeded) => {
        if (
          succeeded &&
          currentSessionUserIdRef.current === startingSessionId &&
          movieSessionUserIdRef.current === startingSessionId
        ) {
          setSavePending(true);
          try {
            await saveMetadata();
          } catch {
            if (
              currentSessionUserIdRef.current === startingSessionId &&
              movieSessionUserIdRef.current === startingSessionId
            )
              setError(
                "メタデータの保存に失敗しました。「保存」で再度お試しください",
              );
          } finally {
            if (
              currentSessionUserIdRef.current === startingSessionId &&
              movieSessionUserIdRef.current === startingSessionId
            )
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
    const sessionId = currentSessionUserIdRef.current;
    if (!sessionId || movieSessionUserIdRef.current !== sessionId) return;

    setIsSaving(true);
    setError(null);
    try {
      await saveMetadata();
    } catch (err) {
      if (
        currentSessionUserIdRef.current === sessionId &&
        movieSessionUserIdRef.current === sessionId
      )
        setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      if (
        currentSessionUserIdRef.current === sessionId &&
        movieSessionUserIdRef.current === sessionId
      )
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
    const sessionId = currentSessionUserIdRef.current;
    if (
      !sessionId ||
      (movieId !== null && movieSessionUserIdRef.current !== sessionId)
    )
      return;
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
            if (currentSessionUserIdRef.current !== sessionId) return false;
            movieIdRef.current = result.movieId;
            setMovieId(result.movieId);
            movieProfileIdRef.current = result.profileId;
            movieSessionUserIdRef.current = sessionId;
            metadataRef.current = {
              ...metadataRef.current,
              title: result.title,
            };
            setTitle(result.title);
            return upload(result.movieId, result.uploadUrl, file);
          })();
      if (
        succeeded &&
        currentSessionUserIdRef.current === sessionId &&
        movieSessionUserIdRef.current === sessionId
      ) {
        setSavePending(true);
        try {
          await saveMetadata();
        } catch {
          if (
            currentSessionUserIdRef.current === sessionId &&
            movieSessionUserIdRef.current === sessionId
          )
            setError(
              "メタデータの保存に失敗しました。「保存」で再度お試しください",
            );
        } finally {
          if (
            currentSessionUserIdRef.current === sessionId &&
            movieSessionUserIdRef.current === sessionId
          )
            setSavePending(false);
        }
      }
    } finally {
      if (operation === uploadOperationRef.current) {
        uploadActiveRef.current = false;
      }
    }
  };

  const clearCanceledUpload = () => {
    cancelDeleteMovieIdRef.current = null;
    setCancelDeleteFailed(false);
    setFile(null);
    setMovieId(null);
    movieIdRef.current = null;
    movieProfileIdRef.current = null;
    movieSessionUserIdRef.current = null;
    setTitle("");
    setDescription("");
    resetUpload();
    uploadActiveRef.current = false;
  };

  const deleteCanceledMovie = async (
    id: string,
    sessionId: string,
    profileId: string | null,
  ) => {
    setCancelDeletePending(true);
    setError(null);
    try {
      const res = await client.api.v4.movies[":movie"].$delete(
        { param: { movie: id } },
        { headers: { "X-Profile-Id": profileId ?? "" } },
      );
      if (!res.ok && Number(res.status) !== 404) {
        throw new Error("Failed to delete canceled upload");
      }
      if (
        currentSessionUserIdRef.current !== sessionId ||
        movieSessionUserIdRef.current !== sessionId ||
        movieIdRef.current !== id
      )
        return;
      clearCanceledUpload();
    } catch {
      if (
        currentSessionUserIdRef.current === sessionId &&
        movieSessionUserIdRef.current === sessionId &&
        movieIdRef.current === id
      ) {
        setCancelDeleteFailed(true);
        setError("動画の削除に失敗しました。キャンセルを再試行してください。");
        uploadActiveRef.current = false;
      }
    } finally {
      if (
        currentSessionUserIdRef.current === sessionId &&
        movieSessionUserIdRef.current === sessionId
      )
        setCancelDeletePending(false);
    }
  };

  const handleCancelUpload = async () => {
    // Once the upload PUT has landed the server is completing/enqueuing the
    // encode; deleting the movie here would race that completion, so cancel
    // is only offered while bytes are still in flight.
    if (uploadState.phase !== "uploading") return;
    const sessionId = currentSessionUserIdRef.current;
    const movieIdAtStart = movieId;
    const profileId = movieProfileIdRef.current;
    if (!sessionId || movieSessionUserIdRef.current !== sessionId) return;
    if (!cancel()) return;
    uploadOperationRef.current += 1;
    if (movieIdAtStart) {
      cancelDeleteMovieIdRef.current = movieIdAtStart;
      await deleteCanceledMovie(movieIdAtStart, sessionId, profileId);
      return;
    }
    if (currentSessionUserIdRef.current !== sessionId) return;
    clearCanceledUpload();
  };

  const handleRetryCancelDelete = async () => {
    const id = cancelDeleteMovieIdRef.current;
    if (!id || cancelDeletePending) return;
    const sessionId = currentSessionUserIdRef.current;
    if (!sessionId || movieSessionUserIdRef.current !== sessionId) return;
    await deleteCanceledMovie(id, sessionId, movieProfileIdRef.current);
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

          {cancelDeleteFailed && (
            <button
              type="button"
              className="self-start cursor-pointer rounded-md border border-[#ef4444] bg-transparent px-3.5 py-1.5 text-[0.8rem] text-[#ef4444] hover:bg-[rgba(239,68,68,0.15)]"
              onClick={() => void handleRetryCancelDelete()}
              disabled={cancelDeletePending}
            >
              {cancelDeletePending ? "削除中..." : "キャンセルを再試行"}
            </button>
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
                <p className="m-0 text-[0.8rem] text-muted-foreground">
                  指定ユーザーへの招待は保存後、動画編集画面から行えます
                </p>
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
