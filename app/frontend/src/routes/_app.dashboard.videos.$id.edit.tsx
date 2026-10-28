import {
  createFileRoute,
  Link,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import type { FormattedMovie, Visibility } from "@video-host/backend";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { ViewerManager } from "@/components/Dashboard/ViewerManager";
import { useConfirm } from "@/components/Feedback/FeedbackProvider";
import { ApiEndpoint } from "@/contexts/env";
import { useProfileSelectionGeneration } from "@/hooks/useProfileSelectionGeneration";
import { useUpload } from "@/hooks/useUpload";
import { authClient } from "@/lib/auth-client";
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

const isEncodeProgress = (value: unknown): value is EncodeProgress => {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return false;
  }
  return ["queued", "processing", "retrying", "completed", "failed"].includes(
    String(value.status),
  );
};

function EditVideoPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id } = Route.useParams();
  const { data: authSession, isPending: sessionPending } =
    authClient.useSession();
  const session = authSession?.user.id;

  const [movie, setMovie] = useState<FormattedMovie | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [encodeProgress, setEncodeProgress] = useState<EncodeProgress | null>(
    null,
  );
  const { resume, state: uploadState } = useUpload();
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const resumeActiveRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const isResuming =
    uploadState.phase === "uploading" ||
    uploadState.phase === "completing" ||
    uploadState.phase === "creating";
  const hasMovie = movie !== null;
  const movieVariantStatus = movie?.variants?.[0]?.status;
  const { selectedProfileId, generationRef: selectionGenerationRef } =
    useProfileSelectionGeneration(() => {
      fetchGenerationRef.current += 1;
      setMovie(null);
      setIsLoading(true);
      setIsSubmitting(false);
      setError(null);
    });

  useBlocker({
    shouldBlockFn: async () =>
      !(await confirm({
        title: "アップロード中です",
        description: "ファイルの再アップロードが完了するまで移動できません。",
        confirmLabel: "ページを離れる",
        destructive: true,
      })),
    enableBeforeUnload: isResuming,
    disabled: !isResuming,
  });

  const fetchMovie = useCallback(
    async (options?: { preserveForm?: boolean }) => {
      const generation = ++fetchGenerationRef.current;
      if (sessionPending) return;
      if (!session) {
        setLoadError("ログイン状態を確認できませんでした");
        setIsLoading(false);
        return;
      }

      try {
        const res = await client.api.v4.movies[":movie"].$get(
          { param: { movie: id } },
          { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
        );

        if (Number(res.status) === 404) {
          if (generation === fetchGenerationRef.current)
            setLoadError("動画が見つかりません");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch");
        }

        const json = await res.json();
        if (generation !== fetchGenerationRef.current) return;
        const movieData = json.data;
        setMovie(movieData);
        if (!options?.preserveForm) {
          setTitle(movieData.title);
          setDescription(movieData.description || "");
          setVisibility(movieData.visibility);
        }
      } catch {
        if (generation === fetchGenerationRef.current)
          setLoadError("動画の取得に失敗しました");
      } finally {
        if (generation === fetchGenerationRef.current) setIsLoading(false);
      }
    },
    [id, session, sessionPending, selectedProfileId],
  );

  useEffect(() => {
    void fetchMovie();
    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [fetchMovie]);

  const handleResumeFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const selectedFile = e.target.files?.[0];
    input.value = "";
    if (!selectedFile || typeof id !== "string" || resumeActiveRef.current) {
      return;
    }
    resumeActiveRef.current = true;
    try {
      const succeeded = await resume(id, selectedFile);
      if (succeeded) {
        // Refresh variant status without overwriting edits made during resume.
        await fetchMovie({ preserveForm: true });
      }
    } finally {
      resumeActiveRef.current = false;
    }
  };

  // SSE for encoding progress with authentication
  useEffect(() => {
    if (!hasMovie || !session || movieVariantStatus !== "PROCESSING") {
      return;
    }

    // Use dynamic import to avoid SSR issues
    const controller = new AbortController();
    let disposed = false;

    const setupSSE = async () => {
      const { EventSourcePlus } = await import("event-source-plus");
      if (controller.signal.aborted) return;

      const profileId = selectedProfileId;
      const url = new URL(
        `${ApiEndpoint}/api/v4/progress/${encodeURIComponent(id)}`,
        window.location.origin,
      ).href;

      const eventSource = new EventSourcePlus(url, {
        credentials: "include",
        headers: profileId ? { "X-Profile-Id": profileId } : {},
        signal: controller.signal,
      });

      // EventSourcePlus overrides options.signal with its own controller, so
      // cancelling (and stopping its automatic reconnects) has to go through
      // the controller returned by listen().
      const stream = eventSource.listen({
        onMessage: (event) => {
          // The server closes the stream with "end" when there is nothing
          // to report; abort so the client does not reconnect forever.
          if (event.event === "end") {
            controller?.abort();
            return;
          }
          try {
            const parsed: unknown = JSON.parse(event.data);
            if (!isEncodeProgress(parsed)) return;
            const data = parsed;
            setEncodeProgress(data);

            // Reload movie data when completed
            if (data.status === "completed" || data.status === "failed") {
              controller?.abort();
              // Refresh movie data
              client.api.v4.movies[":movie"]
                .$get(
                  { param: { movie: id } },
                  { headers: { "X-Profile-Id": profileId ?? "" } },
                )
                .then(async (res) => {
                  if (!disposed && res.ok) {
                    const json = await res.json();
                    setMovie(json.data);
                    setEncodeProgress(null);
                  }
                })
                .catch(() => {
                  if (!disposed)
                    setError("動画の更新状況を取得できませんでした");
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
      if (controller.signal.aborted) {
        stream.abort();
      } else {
        controller.signal.addEventListener("abort", () => stream.abort(), {
          once: true,
        });
      }
    };

    void setupSSE().catch(() => {
      if (!controller.signal.aborted) {
        setError("エンコード状況の取得に失敗しました");
      }
    });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [hasMovie, id, movieVariantStatus, selectedProfileId, session]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isResuming) return;

    setIsSubmitting(true);
    setError(null);
    const selectionGeneration = selectionGenerationRef.current;

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
        { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
      );

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      if (selectionGenerationRef.current === selectionGeneration)
        await navigate({ to: "/dashboard/videos" });
    } catch (err) {
      if (selectionGenerationRef.current === selectionGeneration) {
        setError(err instanceof Error ? err.message : "更新に失敗しました");
        setIsSubmitting(false);
      }
    }
  };

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (!movie) {
    return (
      <section className="space-y-4" role="alert">
        <p>{loadError ?? "動画が見つかりません"}</p>
        <Link className="text-primary underline" to="/dashboard/videos">
          動画一覧へ戻る
        </Link>
      </section>
    );
  }

  const variant = movie.variants?.[0];
  const isEncoding = variant?.status === "PROCESSING";
  const isUploadPending = variant?.status === "UPLOADING";
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

        {/* Upload resume: record exists but the file never fully landed */}
        {isUploadPending && (
          <div
            className="mb-6 flex max-w-[600px] flex-col gap-3 rounded-xl border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.1)] p-6 text-[#eab308]"
            aria-live="polite"
          >
            {isResuming ? (
              <>
                <div className="font-medium text-[#eab308]">
                  アップロード中 ({uploadState.progress}%)
                </div>
                <div className="h-2 overflow-hidden rounded bg-[rgba(234,179,8,0.2)]">
                  <div
                    className="h-full rounded bg-[#eab308] transition-[width]"
                    style={{ width: `${uploadState.progress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <span>
                  この動画はアップロードが完了していません。ファイルを選択するとアップロードを再開できます。
                </span>
                <button
                  type="button"
                  className="self-start cursor-pointer rounded-lg border border-[#eab308] bg-transparent px-5 py-2.5 font-medium text-[#eab308] hover:bg-[rgba(234,179,8,0.15)]"
                  onClick={() => resumeFileInputRef.current?.click()}
                  disabled={isResuming || resumeActiveRef.current}
                >
                  アップロードを再開
                </button>
              </>
            )}
            {uploadState.phase === "error" && (
              <div className="error-message">{uploadState.error}</div>
            )}
          </div>
        )}
        <input
          ref={resumeFileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => void handleResumeFileChange(e)}
          disabled={isResuming}
          hidden
        />

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
              onChange={(e) => setVisibility(e.target.value as Visibility)}
            >
              <option value="PUBLIC">公開</option>
              <option value="UNLISTED">限定公開</option>
              <option value="LIMITED">指定ユーザー公開</option>
              <option value="PRIVATE">非公開</option>
            </select>
          </div>

          {visibility === "LIMITED" && (
            <div className="form-group">
              <span className="text-sm font-medium">公開するユーザー</span>
              <ViewerManager
                targetType="MOVIE"
                targetId={movie.id}
                viewers={movie.viewers ?? []}
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => void navigate({ to: "/dashboard/videos" })}
              className="cancel-button"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting || isResuming}
              className="submit-button"
            >
              {isSubmitting ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
