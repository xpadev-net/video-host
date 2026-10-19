import { sendCallback } from "./callback";
import {
  COMPLETION_COMMIT_ATTEMPTS,
  COMPLETION_COMMIT_RETRY_BASE_MS,
  DISK_SPACE_MARGIN_BYTES,
  DISK_SPACE_MULTIPLIER,
} from "./config";
import { getDiskSpace } from "./disk";
import {
  cleanup,
  encodeVideo,
  generateThumbnail,
  getLocalPath,
} from "./encoder";
import { getVodContentUrl, JOB_TIMEOUT_SECONDS } from "./env";
import { createJobFinalizer } from "./job-finalizer";
import { log } from "./logger";
import {
  callbackFailures,
  encodeInputBytes,
  encodeStageDuration,
  ffmpegSpeed,
} from "./metrics";
import {
  addJobToDeadLetterQueue,
  addJobToRetryQueue,
  commitProcessingJob,
  deferJobForInfrastructure,
  type EncodeJob,
  getEncodeProgress,
  getJobCompletion,
  MAX_RETRY_COUNT,
  requeueProcessingJob,
  setEncodeProgress,
} from "./queue";
import {
  deleteFromProd,
  deleteFromTmp,
  downloadFromTmp,
  getTmpObjectSize,
  uploadToProd,
} from "./s3";

export type JobResult =
  | "completed"
  | "failed"
  | "retrying"
  | "error"
  | "relinquished";
export interface JobContext {
  shutdownSignal: AbortSignal;
  activeJobClaim: string | null;
  activeJobCommitted: boolean;
  jobRelinquished: boolean;
  getAbortController(): AbortController | null;
  setAbortController(controller: AbortController | null): void;
}

const sendCallbackObserved = async (
  payload: Parameters<typeof sendCallback>[0],
): Promise<Awaited<ReturnType<typeof sendCallback>>> => {
  try {
    const result = await sendCallback(payload);
    if (result === "rejected")
      callbackFailures.add(1, { status: payload.status, reason: "rejected" });
    return result;
  } catch (error) {
    callbackFailures.add(1, { status: payload.status });
    throw error;
  }
};

const jobFinalizer = createJobFinalizer({
  setProgress: setEncodeProgress,
  callback: sendCallbackObserved,
  deleteOutput: deleteFromProd,
});

export const markJobFailed = async (
  job: EncodeJob,
  reason: string,
  stderrTail?: string,
): Promise<void> => {
  await addJobToDeadLetterQueue(job, reason, stderrTail);
  await jobFinalizer.notifyFailure(job);
};

export const { finalizeSuccess } = jobFinalizer;

const retryOrDeadLetter = async (
  job: EncodeJob,
  reason: string,
  processingMember?: string,
  retryable = true,
): Promise<JobResult> => {
  if (retryable && (job.retryCount ?? 0) < MAX_RETRY_COUNT) {
    await addJobToRetryQueue(job, processingMember);
    await setEncodeProgress(job.movieId, { status: "retrying" });
    return "retrying";
  }
  await markJobFailed(job, reason);
  return "failed";
};

// Was this failure produced by the abort itself? A permanent failure (bad
// input, HTTP 4xx, ...) that merely coincides with SIGTERM must keep its own
// classification instead of being handed back as if shutdown had caused it.
const isAbortFailure = (error: unknown, signal: AbortSignal): boolean => {
  if (!signal.aborted) return false;
  if (typeof error === "string") return /aborted/i.test(error);
  if (typeof error !== "object" || error === null) return false;
  const { name, code, message } = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    name === "AbortError" ||
    code === "ABORT_ERR" ||
    (typeof message === "string" && /aborted/i.test(message))
  );
};

// A shutdown interrupted this job before its output was committed. Hand the
// claim back to the main queue untouched: the job did nothing wrong, so it must
// not consume a retry (a few deploys would otherwise exhaust a long job).
const handBackOnShutdown = async (
  job: EncodeJob,
  context: JobContext,
): Promise<JobResult> => {
  context.jobRelinquished = true;
  console.warn(
    `Requeueing job interrupted by shutdown: movieId=${job.movieId}`,
  );
  if (!context.activeJobClaim) {
    return "relinquished";
  }
  const requeued = await requeueProcessingJob(context.activeJobClaim, job);
  if (requeued) {
    await setEncodeProgress(job.movieId, { status: "queued" }).catch(
      () => undefined,
    );
  } else {
    console.warn(`Shutdown claim already handed off: movieId=${job.movieId}`);
  }
  return "relinquished";
};

const measureStage = async <T>(
  job: EncodeJob,
  stage: "downloading" | "encoding" | "uploading" | "deleting",
  callback: () => Promise<T>,
): Promise<T> => {
  const previousProgress = await getEncodeProgress(job.movieId);
  await setEncodeProgress(job.movieId, {
    ...(previousProgress ?? {}),
    status: "processing",
    stage,
    progress: previousProgress?.progress ?? 0,
  });
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    encodeStageDuration.record((performance.now() - startedAt) / 1000, {
      stage,
      retryCount: job.retryCount ?? 0,
    });
  }
};

export const processJob = async (
  job: EncodeJob,
  context: JobContext,
): Promise<JobResult> => {
  log.info(`Processing job: movieId=${job.movieId}, s3Key=${job.s3Key}`);

  if (context.jobRelinquished) {
    return "relinquished";
  }

  // Set status to processing
  await setEncodeProgress(job.movieId, { status: "processing", progress: 0 });

  const inputPath = getLocalPath(job.s3Key, "_input");
  const outputPath = getLocalPath(job.s3Key, "_output.mp4");
  const thumbnailPath = getLocalPath(job.s3Key, "_thumbnail.jpg");
  const filesToCleanup = [inputPath, outputPath, thumbnailPath];

  // Set once the tmp input is deleted: past that point the job can only be
  // finalized as success — re-encoding is impossible, so errors in the
  // finalize steps must never fall into the retry/failed path.
  let committedOutcome: {
    contentUrl: string;
    duration?: number;
    thumbnailKey?: string;
  } | null = null;

  // Create abort controller for timeout management
  const abortController = new AbortController();
  let jobTimedOut = false;
  let shutdownAbortRequested = false;
  context.setAbortController(abortController);
  const onShutdownAbort = () => {
    shutdownAbortRequested = true;
    abortController.abort();
  };
  if (context.shutdownSignal.aborted) {
    shutdownAbortRequested = true;
    abortController.abort();
  } else {
    context.shutdownSignal.addEventListener("abort", onShutdownAbort, {
      once: true,
    });
  }
  const timeoutId = setTimeout(() => {
    jobTimedOut = true;
    log.error(
      `Job timeout after ${JOB_TIMEOUT_SECONDS} seconds: movieId=${job.movieId}`,
    );
    abortController.abort();
  }, JOB_TIMEOUT_SECONDS * 1000);

  try {
    const objectSize = await getTmpObjectSize(job.s3Key);
    encodeInputBytes.record(objectSize, { retryCount: job.retryCount ?? 0 });
    const requiredBytes =
      Math.ceil(objectSize * DISK_SPACE_MULTIPLIER) + DISK_SPACE_MARGIN_BYTES;
    const disk = await getDiskSpace();
    if (requiredBytes > disk.totalBytes) {
      await markJobFailed(
        job,
        `Input is too large for worker scratch storage (${objectSize} bytes; required ${requiredBytes}, capacity ${disk.totalBytes})`,
      );
      return "failed";
    }
    if (disk.availableBytes < requiredBytes) {
      log.warn(
        `Deferring job for disk space: movieId=${job.movieId}, available=${disk.availableBytes}, required=${requiredBytes}`,
      );
      if (!context.activeJobClaim)
        throw new Error("Cannot defer an unclaimed encode job");
      await deferJobForInfrastructure(job, context.activeJobClaim);
      await setEncodeProgress(job.movieId, { status: "retrying" });
      return "retrying";
    }

    log.info(`Downloading from tmp-bucket: ${job.s3Key}`);
    await measureStage(job, "downloading", () =>
      downloadFromTmp(job.s3Key, inputPath, abortController.signal),
    );

    // Encode video with progress callback and abort signal
    log.info(`Encoding video to: ${outputPath}`);
    const result = await measureStage(job, "encoding", () =>
      encodeVideo(
        inputPath,
        outputPath,
        async (progress) => {
          if (context.jobRelinquished) return;
          if (progress.speed !== undefined) {
            ffmpegSpeed.record(progress.speed, {
              retryCount: job.retryCount ?? 0,
            });
          }
          await setEncodeProgress(job.movieId, {
            status: "processing",
            progress: progress.percent,
            currentTime: progress.currentTime,
            duration: progress.duration,
            stage: "encoding",
          });
        },
        abortController.signal,
      ),
    );
    // Snapshot the shutdown request when encoding settles. A later SIGTERM
    // must not replace a permanent encoder result with a shutdown hand-back.
    const shutdownRequestedWhenEncodingSettled = shutdownAbortRequested;

    if (!result.success && jobTimedOut) result.kind = "timeout";

    if (context.jobRelinquished) {
      return "relinquished";
    }

    if (!result.success) {
      // A timeout that fired before SIGTERM stays a timeout, and a failure the
      // abort did not cause keeps its own classification.
      if (
        shutdownRequestedWhenEncodingSettled &&
        !committedOutcome &&
        !jobTimedOut &&
        isAbortFailure(result.error, abortController.signal)
      ) {
        return await handBackOnShutdown(job, context);
      }
      log.error(`Encoding failed: ${result.error}`);
      if (/No space left on device|ENOSPC/i.test(result.error ?? "")) {
        if (!context.activeJobClaim)
          throw new Error("Cannot defer an unclaimed encode job");
        await deferJobForInfrastructure(job, context.activeJobClaim);
        await setEncodeProgress(job.movieId, { status: "retrying" });
        return "retrying";
      }
      const retryable = result.kind === "transient";
      if (!retryable) {
        await markJobFailed(
          job,
          `${result.kind ?? "permanent"}: ${result.error ?? "Encoding failed"}`,
          result.error,
        );
        return "failed";
      }
      try {
        return await retryOrDeadLetter(
          job,
          result.error ?? "Transient encoding failure",
          context.activeJobClaim ?? undefined,
        );
      } catch (retryError) {
        log.error(
          `Failed to schedule retry: movieId=${job.movieId}`,
          retryError,
        );
        await markJobFailed(
          job,
          `Retry scheduling failed: ${String(retryError)}`,
          result.error,
        );
        return "failed";
      }
    }

    const thumbnailKey = `${job.s3Key}.jpg`;
    let uploadedThumbnailKey: string | undefined;
    await measureStage(job, "uploading", async () => {
      log.info(`Uploading to prod-bucket: ${job.s3Key}`);
      await uploadToProd(
        job.s3Key,
        outputPath,
        "video/mp4",
        abortController.signal,
      );

      try {
        await generateThumbnail(
          outputPath,
          thumbnailPath,
          result.duration ?? 0,
          abortController.signal,
        );
        await uploadToProd(
          thumbnailKey,
          thumbnailPath,
          "image/jpeg",
          abortController.signal,
        );
        uploadedThumbnailKey = thumbnailKey;
      } catch (thumbnailError) {
        if (abortController.signal.aborted) throw thumbnailError;
        await deleteFromProd(thumbnailKey).catch(() => {});
        log.warn(
          `Thumbnail generation failed: movieId=${job.movieId}`,
          thumbnailError,
        );
      }
    });

    // Persist the completion before deleting the source. If shutdown or a
    // worker crash happens while object storage is processing the delete, the
    // reaper can finalize the uploaded output instead of requeueing a job whose
    // input may already be gone.
    const contentUrl = getVodContentUrl(job.s3Key);
    const completion = {
      contentUrl,
      duration: result.duration,
      thumbnailKey: uploadedThumbnailKey,
    };
    if (!context.activeJobClaim) {
      throw new Error("Cannot commit an unclaimed encode job");
    }
    let committedMember: string | null = null;
    let commitError: unknown;
    for (
      let attempt = 0;
      attempt < COMPLETION_COMMIT_ATTEMPTS && !committedMember;
      attempt++
    ) {
      try {
        committedMember = await commitProcessingJob(
          context.activeJobClaim,
          job,
          completion,
        );
      } catch (error) {
        commitError = error;
        if (attempt < COMPLETION_COMMIT_ATTEMPTS - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, COMPLETION_COMMIT_RETRY_BASE_MS * 2 ** attempt),
          );
        }
      }
    }
    if (!committedMember) {
      // A lost Redis reply may hide a successful write. Reconcile the durable
      // completion key before deciding whether this claim can be handed off.
      const persistedCompletion = await getJobCompletion(
        job.movieId,
        job.s3Key,
      ).catch(() => null);
      if (persistedCompletion) {
        committedMember = context.activeJobClaim;
        completion.contentUrl = persistedCompletion.contentUrl;
        completion.duration = persistedCompletion.duration;
        completion.thumbnailKey = persistedCompletion.thumbnailKey;
      }
    }
    if (!committedMember) {
      // Keep the processing claim for the reaper. It will finalize a write
      // whose reply was lost, or requeue the untouched source if Redis never
      // persisted the completion. This is not a media failure or retry.
      context.jobRelinquished = true;
      log.error(
        `Could not persist encode completion; leaving claim for reaper: movieId=${job.movieId}`,
        commitError,
      );
      return "relinquished";
    }
    context.activeJobClaim = committedMember;
    committedOutcome = completion;
    context.activeJobCommitted = true;

    // The durable completion record now protects a source deletion whose
    // result may be uncertain during a shutdown or network failure.
    log.info(`Deleting from tmp-bucket: ${job.s3Key}`);
    await measureStage(job, "deleting", () =>
      deleteFromTmp(job.s3Key, abortController.signal),
    );

    if (context.jobRelinquished) {
      return "relinquished";
    }

    return await finalizeSuccess(job, completion);
  } catch (error) {
    if (context.jobRelinquished) {
      return "relinquished";
    }
    // Same rule for thrown errors: only an abort-caused one is the shutdown's.
    if (
      shutdownAbortRequested &&
      !committedOutcome &&
      !jobTimedOut &&
      isAbortFailure(error, abortController.signal)
    ) {
      return await handBackOnShutdown(job, context);
    }
    if (committedOutcome) {
      // Input is already deleted — an encode retry would fail to download
      // it. Finalize as success instead of re-encoding.
      log.error(
        `Job failed after commit, finalizing as completed: movieId=${job.movieId}`,
        error,
      );
      try {
        return await finalizeSuccess(job, committedOutcome);
      } catch (finalizeError) {
        log.error(
          `Failed to finalize committed job: movieId=${job.movieId}`,
          finalizeError,
        );
        // Keep the job recoverable: ensure the claim is marked committed so
        // a reaper can retry the finalize instead of losing it on release.
        if (context.activeJobClaim) {
          try {
            context.activeJobClaim = await commitProcessingJob(
              context.activeJobClaim,
              job,
              committedOutcome,
            );
          } catch (claimError) {
            log.error(
              `Failed to persist committed claim: movieId=${job.movieId}`,
              claimError,
            );
          }
        }
        return "error";
      }
    }
    log.error(`Job failed: movieId=${job.movieId}`, error);
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (errorCode === "ENOSPC") {
      if (!context.activeJobClaim)
        throw new Error("Cannot defer an unclaimed encode job");
      await deferJobForInfrastructure(job, context.activeJobClaim);
      await setEncodeProgress(job.movieId, { status: "retrying" });
      return "retrying";
    }
    const httpStatus =
      typeof error === "object" && error !== null && "$metadata" in error
        ? Number(
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode,
          )
        : undefined;
    // jobTimedOut is latched when the timer fires, so a SIGTERM that arrives
    // afterwards cannot turn a timeout into a retryable failure.
    const timedOut =
      jobTimedOut ||
      (abortController.signal.aborted && !context.shutdownSignal.aborted);
    const retryable =
      !timedOut &&
      ![400, 401, 403, 404, 405, 410, 413, 415].includes(httpStatus ?? -1);
    try {
      return await retryOrDeadLetter(
        job,
        timedOut ? `Job timed out: ${String(error)}` : String(error),
        context.activeJobClaim ?? undefined,
        retryable,
      );
    } catch (retryError) {
      log.error(`Failed to schedule retry: movieId=${job.movieId}`, retryError);
      await markJobFailed(
        job,
        `Retry scheduling failed: ${String(retryError)}`,
      );
      return "failed";
    }
  } finally {
    // Clear timeout if job completed before timeout
    clearTimeout(timeoutId);
    context.shutdownSignal.removeEventListener("abort", onShutdownAbort);
    if (context.getAbortController() === abortController) {
      context.setAbortController(null);
    }
    cleanup(filesToCleanup);
  }
};
