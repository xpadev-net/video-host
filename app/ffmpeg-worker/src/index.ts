import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sendCallback } from "./callback";
import {
  DISK_SPACE_MARGIN_BYTES,
  DISK_SPACE_MULTIPLIER,
  PROCESSING_JOB_HEARTBEAT_MS,
  RETRY_QUEUE_POLL_INTERVAL_MS,
} from "./config";
import { getDiskSpace } from "./disk";
import {
  cleanup,
  encodeVideo,
  generateThumbnail,
  getLocalPath,
} from "./encoder";
import {
  getVodContentUrl,
  JOB_TIMEOUT_SECONDS,
  MIN_DISK_SPACE_GB,
  POLL_INTERVAL_MS,
  TEMP_DIR,
} from "./env";
import { log, withLogContext } from "./logger";
import {
  callbackFailures,
  encodeInputBytes,
  encodeJobDuration,
  encodeJobs,
  encodeStageDuration,
  ffmpegSpeed,
  retryQueueMoved,
} from "./metrics";
import { shutdownOtelMetrics } from "./otel";
import {
  addJobToDeadLetterQueue,
  addJobToRetryQueue,
  claimNextEncodeJob,
  closeRedis,
  commitProcessingJob,
  deferJobForInfrastructure,
  type EncodeJob,
  expireProcessingJob,
  finishProcessingJob,
  getEncodeProgress,
  getJobCompletion,
  MAX_RETRY_COUNT,
  processRetryQueue,
  refreshProcessingJob,
  releaseProcessingJob,
  requeueProcessingJob,
  setEncodeProgress,
} from "./queue";
import { createReaper } from "./reaper";
import {
  deleteFromProd,
  deleteFromTmp,
  downloadFromTmp,
  getTmpObjectSize,
  uploadToProd,
} from "./s3";

const execFileAsync = promisify(execFile);
const HEARTBEAT_FILE = join(TEMP_DIR, "healthy");
const READINESS_FILE = join(TEMP_DIR, "ready");
const writeHeartbeat = () =>
  writeFile(HEARTBEAT_FILE, `${Date.now()}\n`).catch((error) =>
    log.error("Failed to update worker heartbeat", error),
  );
void writeHeartbeat();
const heartbeatTimer = setInterval(() => void writeHeartbeat(), 15_000);
heartbeatTimer.unref();
const writeReadiness = () =>
  writeFile(READINESS_FILE, `${Date.now()}\n`).catch((error) =>
    log.warn("Failed to update worker readiness", error),
  );

log.info("FFmpeg Worker starting...");
log.info(`Commit Hash: ${process.env.COMMIT_HASH || "unknown"}`);

const sendCallbackObserved = async (
  payload: Parameters<typeof sendCallback>[0],
): Promise<Awaited<ReturnType<typeof sendCallback>>> => {
  try {
    const result = await sendCallback(payload);
    if (result === "rejected") {
      callbackFailures.add(1, { status: payload.status, reason: "rejected" });
    }
    return result;
  } catch (error) {
    callbackFailures.add(1, { status: payload.status });
    throw error;
  }
};
const { finalizeCommittedClaim, runReaper } =
  createReaper(sendCallbackObserved);

let isShuttingDown = false;

// The job currently being processed (if any) together with its processing
// claim in Redis. On shutdown the claim is expired instead of republishing
// the job, so another worker can only take it over after this worker has
// relinquished terminal writes.
let activeJob: EncodeJob | null = null;
let activeJobClaim: string | null = null;
let activeJobCommitted = false;
let jobRelinquished = false;
let activeJobAbortController: AbortController | null = null;
let leaseHeartbeatTimer: NodeJS.Timeout | null = null;

// The whole shutdown has to fit inside the pod's terminationGracePeriodSeconds
// (90 s): drain/settle below, ffmpeg's own 5 s SIGKILL escalation, then the
// claim handoff and telemetry flush. Worst case here is about 20 + 5 + 5 s.

// A job whose output is already committed can only be finalized (callback), so
// it is given this long to finish instead of being aborted.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000;

// After aborting the in-flight job, give its own handling a bounded window to
// hand it back to the queue.
const SHUTDOWN_SETTLE_TIMEOUT_MS = 15_000;

// Aborted on shutdown so the in-flight job stops via the normal failure
// path instead of running alongside a requeued copy on another worker.
const jobShutdownAbort = new AbortController();

const startLeaseHeartbeat = (
  member: string,
  job: EncodeJob,
  claimId: string,
): void => {
  let inFlight = false;
  leaseHeartbeatTimer = setInterval(async () => {
    if (inFlight || activeJobClaim !== member || jobRelinquished) return;
    inFlight = true;
    await withLogContext(
      log.child({
        movieId: job.movieId,
        claimId,
        retryCount: job.retryCount ?? 0,
        s3Key: job.s3Key,
      }),
      async () => {
        try {
          const refreshed = await refreshProcessingJob(member);
          if (refreshed) await writeReadiness();
          if (!refreshed && activeJobClaim === member) {
            log.error("Processing claim was lost");
            jobRelinquished = true;
            activeJobAbortController?.abort(new Error("Processing claim lost"));
          }
        } catch (error) {
          log.error("Failed to refresh processing lease", error);
        } finally {
          inFlight = false;
        }
      },
    );
  }, PROCESSING_JOB_HEARTBEAT_MS);
  leaseHeartbeatTimer.unref();
};

const stopLeaseHeartbeat = (): void => {
  if (!leaseHeartbeatTimer) return;
  clearInterval(leaseHeartbeatTimer);
  leaseHeartbeatTimer = null;
};

// "error" marks unexpected processJob rejections (no confirmed terminal
// outcome), distinct from handled "failed" paths. "relinquished" marks a
// job whose ownership was transferred to the queue during shutdown.
type JobResult = "completed" | "failed" | "retrying" | "error" | "relinquished";

const markJobFailed = async (
  job: EncodeJob,
  reason: string,
  stderrTail?: string,
): Promise<void> => {
  await addJobToDeadLetterQueue(job, reason, stderrTail);
  await setEncodeProgress(job.movieId, { status: "failed" });
  await sendCallbackObserved({
    movieId: job.movieId,
    variantId: "original",
    status: "failed",
    s3Key: job.s3Key,
  });
};

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
const handBackOnShutdown = async (job: EncodeJob): Promise<JobResult> => {
  jobRelinquished = true;
  console.warn(
    `Requeueing job interrupted by shutdown: movieId=${job.movieId}`,
  );
  if (!activeJobClaim) {
    return "relinquished";
  }
  const requeued = await requeueProcessingJob(activeJobClaim, job);
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

const processJob = async (job: EncodeJob): Promise<JobResult> => {
  log.info(`Processing job: movieId=${job.movieId}, s3Key=${job.s3Key}`);

  if (jobRelinquished) {
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
  activeJobAbortController = abortController;
  const onShutdownAbort = () => {
    shutdownAbortRequested = true;
    abortController.abort();
  };
  if (jobShutdownAbort.signal.aborted) {
    shutdownAbortRequested = true;
    abortController.abort();
  } else {
    jobShutdownAbort.signal.addEventListener("abort", onShutdownAbort, {
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
      if (!activeJobClaim)
        throw new Error("Cannot defer an unclaimed encode job");
      await deferJobForInfrastructure(job, activeJobClaim);
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
          if (jobRelinquished) return;
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

    if (jobRelinquished) {
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
        return await handBackOnShutdown(job);
      }
      log.error(`Encoding failed: ${result.error}`);
      if (/No space left on device|ENOSPC/i.test(result.error ?? "")) {
        if (!activeJobClaim)
          throw new Error("Cannot defer an unclaimed encode job");
        await deferJobForInfrastructure(job, activeJobClaim);
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
          activeJobClaim ?? undefined,
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
    if (!activeJobClaim) {
      throw new Error("Cannot commit an unclaimed encode job");
    }
    let committedMember: string | null = null;
    let commitError: unknown;
    for (let attempt = 0; attempt < 3 && !committedMember; attempt++) {
      try {
        committedMember = await commitProcessingJob(
          activeJobClaim,
          job,
          completion,
        );
      } catch (error) {
        commitError = error;
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * 2 ** attempt),
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
        committedMember = activeJobClaim;
        completion.contentUrl = persistedCompletion.contentUrl;
        completion.duration = persistedCompletion.duration;
        completion.thumbnailKey = persistedCompletion.thumbnailKey;
      }
    }
    if (!committedMember) {
      // Keep the processing claim for the reaper. It will finalize a write
      // whose reply was lost, or requeue the untouched source if Redis never
      // persisted the completion. This is not a media failure or retry.
      jobRelinquished = true;
      log.error(
        `Could not persist encode completion; leaving claim for reaper: movieId=${job.movieId}`,
        commitError,
      );
      return "relinquished";
    }
    activeJobClaim = committedMember;
    committedOutcome = completion;
    activeJobCommitted = true;

    // The durable completion record now protects a source deletion whose
    // result may be uncertain during a shutdown or network failure.
    log.info(`Deleting from tmp-bucket: ${job.s3Key}`);
    await measureStage(job, "deleting", () =>
      deleteFromTmp(job.s3Key, abortController.signal),
    );

    if (jobRelinquished) {
      return "relinquished";
    }

    // Set status to completed
    await setEncodeProgress(job.movieId, {
      status: "completed",
      progress: 100,
      duration: result.duration,
    });

    // Send success callback
    const callbackResult = await sendCallbackObserved({
      movieId: job.movieId,
      variantId: "original",
      status: "success",
      s3Key: job.s3Key,
      contentUrl,
      duration: result.duration,
      thumbnailKey: uploadedThumbnailKey,
    });

    if (callbackResult === "rejected") {
      await deleteFromProd(job.s3Key).catch((error) =>
        log.error(
          `Failed to remove rejected output: movieId=${job.movieId}`,
          error,
        ),
      );
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallbackObserved({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
        s3Key: job.s3Key,
      });
      return "failed";
    }

    log.info(`Job completed successfully: movieId=${job.movieId}`);
    return "completed";
  } catch (error) {
    if (jobRelinquished) {
      return "relinquished";
    }
    // Same rule for thrown errors: only an abort-caused one is the shutdown's.
    if (
      shutdownAbortRequested &&
      !committedOutcome &&
      !jobTimedOut &&
      isAbortFailure(error, abortController.signal)
    ) {
      return await handBackOnShutdown(job);
    }
    if (committedOutcome) {
      // Input is already deleted — an encode retry would fail to download
      // it. Finalize as success instead of re-encoding.
      log.error(
        `Job failed after commit, finalizing as completed: movieId=${job.movieId}`,
        error,
      );
      try {
        await setEncodeProgress(job.movieId, {
          status: "completed",
          progress: 100,
          duration: committedOutcome.duration,
        });
        const callbackResult = await sendCallbackObserved({
          movieId: job.movieId,
          variantId: "original",
          status: "success",
          s3Key: job.s3Key,
          contentUrl: committedOutcome.contentUrl,
          duration: committedOutcome.duration,
          thumbnailKey: committedOutcome.thumbnailKey,
        });
        if (callbackResult === "rejected") {
          await deleteFromProd(job.s3Key).catch(() => {});
          await setEncodeProgress(job.movieId, { status: "failed" });
          await sendCallbackObserved({
            movieId: job.movieId,
            variantId: "original",
            status: "failed",
            s3Key: job.s3Key,
          });
          return "failed";
        }
        return "completed";
      } catch (finalizeError) {
        log.error(
          `Failed to finalize committed job: movieId=${job.movieId}`,
          finalizeError,
        );
        // Keep the job recoverable: ensure the claim is marked committed so
        // a reaper can retry the finalize instead of losing it on release.
        if (activeJobClaim) {
          try {
            activeJobClaim = await commitProcessingJob(
              activeJobClaim,
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
      if (!activeJobClaim)
        throw new Error("Cannot defer an unclaimed encode job");
      await deferJobForInfrastructure(job, activeJobClaim);
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
      (abortController.signal.aborted && !jobShutdownAbort.signal.aborted);
    const retryable =
      !timedOut &&
      ![400, 401, 403, 404, 405, 410, 413, 415].includes(httpStatus ?? -1);
    try {
      return await retryOrDeadLetter(
        job,
        timedOut ? `Job timed out: ${String(error)}` : String(error),
        activeJobClaim ?? undefined,
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
    jobShutdownAbort.signal.removeEventListener("abort", onShutdownAbort);
    if (activeJobAbortController === abortController) {
      activeJobAbortController = null;
    }
    cleanup(filesToCleanup);
  }
};

const pollForJobs = async (): Promise<void> => {
  // Process retry queue periodically to move due jobs back to the main queue.
  const retryQueueInterval = setInterval(async () => {
    if (!isShuttingDown) {
      try {
        const moved = await processRetryQueue();
        if (moved > 0) {
          retryQueueMoved.add(moved);
        }
      } catch (error) {
        log.error("Error processing retry queue:", error);
      }
      try {
        await runReaper(isShuttingDown);
      } catch (error) {
        log.error("Error reaping stale processing jobs:", error);
      }
    } else {
      clearInterval(retryQueueInterval);
    }
  }, RETRY_QUEUE_POLL_INTERVAL_MS);

  // Process retry queue once at startup
  try {
    const moved = await processRetryQueue();
    if (moved > 0) {
      retryQueueMoved.add(moved);
    }
  } catch (error) {
    log.error("Error processing retry queue at startup:", error);
  }

  // Recover claims left behind by workers that died mid-job.
  try {
    await runReaper(isShuttingDown);
  } catch (error) {
    log.error("Error reaping stale processing jobs at startup:", error);
  }

  while (!isShuttingDown) {
    try {
      const disk = await getDiskSpace();
      const minimumAvailableBytes = MIN_DISK_SPACE_GB * 1024 * 1024 * 1024;
      if (disk.availableBytes < minimumAvailableBytes) {
        log.warn(
          `Pausing queue polling for low disk space: available=${disk.availableBytes}, minimum=${minimumAvailableBytes}`,
        );
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      const claim = await claimNextEncodeJob();
      await writeReadiness();
      if (!claim) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      const job = claim.job;
      const jobStartedAt = performance.now();
      let jobPath = "encode";
      const jobLogger = log.child({
        movieId: job.movieId,
        claimId: claim.claimId,
        retryCount: job.retryCount ?? 0,
        s3Key: job.s3Key,
      });
      activeJob = job;
      activeJobClaim = claim.member;
      activeJobCommitted = false;
      jobRelinquished = false;
      startLeaseHeartbeat(claim.member, job, claim.claimId);

      let result: JobResult = "error";
      try {
        result = await withLogContext(jobLogger, async () => {
          // The same input may already have a committed output. Finish its
          // callback instead of encoding a potentially deleted temp object.
          const priorCompletion = await getJobCompletion(
            job.movieId,
            job.s3Key,
          ).catch(() => null);
          if (priorCompletion) {
            jobPath = "prior_completion";
            activeJobCommitted = true;
            await finalizeCommittedClaim(claim.member, job, priorCompletion);
            return "completed";
          }
          return processJob(job);
        });
      } catch (error) {
        await withLogContext(jobLogger, async () => {
          log.error("Job processing threw unexpectedly", error);
          try {
            await markJobFailed(
              job,
              `Unexpected worker error: ${String(error)}`,
            );
          } catch (notifyError) {
            log.error("Failed to report job failure", notifyError);
          }
        });
        result = "error";
      } finally {
        stopLeaseHeartbeat();
        const claimResolved =
          !jobRelinquished &&
          (!activeJobCommitted ||
            result === "completed" ||
            result === "failed");
        if (claimResolved) {
          try {
            if (activeJobCommitted || result === "completed") {
              await finishProcessingJob(claim.member, job);
            } else {
              await releaseProcessingJob(claim.member);
            }
          } catch (releaseError) {
            withLogContext(jobLogger, () =>
              log.error("Failed to release processing claim", releaseError),
            );
          }
        }
        activeJob = null;
        activeJobClaim = null;
        activeJobAbortController = null;
        activeJobCommitted = false;
      }
      encodeJobs.add(1, { result });
      encodeJobDuration.record((performance.now() - jobStartedAt) / 1000, {
        result,
        path: jobPath,
        retryCount: job.retryCount ?? 0,
      });
    } catch (error) {
      log.error("Error polling for jobs:", error);
      // On error, wait a bit before retrying to avoid tight error loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  clearInterval(retryQueueInterval);
};

const shutdown = async (): Promise<void> => {
  if (isShuttingDown) {
    return;
  }
  log.info("Shutting down...");
  isShuttingDown = true;
  // Anything still encoding (or about to start) is stopped right away and
  // handed back to the queue: waiting for it would just burn the grace period.
  // A job that already committed its output can only be finalized, so it is
  // allowed to finish.
  const finalizing = activeJob !== null && activeJobCommitted;
  if (!finalizing) {
    if (activeJob) {
      console.warn(
        `Aborting in-flight job on shutdown: movieId=${activeJob.movieId}`,
      );
    }
    jobShutdownAbort.abort();
  }
  // Wait for the job (if any) so its result metrics, progress updates and
  // callbacks are sent before the provider is shut down.
  clearInterval(heartbeatTimer);
  await Promise.race([
    pollPromise,
    new Promise((resolve) =>
      setTimeout(
        resolve,
        finalizing ? SHUTDOWN_DRAIN_TIMEOUT_MS : SHUTDOWN_SETTLE_TIMEOUT_MS,
      ),
    ),
  ]);
  // A finalizing job that is still stuck is aborted too, with one more short
  // window before the last-resort handoff below.
  if (activeJob && finalizing) {
    jobShutdownAbort.abort();
    await Promise.race([
      pollPromise,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  // Last resort: the job did not settle even after abort. Atomically hand an
  // uncommitted job back to the main queue; committed claims go to the reaper
  // so their already-uploaded output is finalized instead of re-encoded.
  if (activeJob) {
    log.warn(
      `Relinquishing in-flight job on shutdown: movieId=${activeJob.movieId}`,
    );
    jobRelinquished = true;
    stopLeaseHeartbeat();
    if (activeJobClaim) {
      try {
        if (activeJobCommitted) {
          await expireProcessingJob(activeJobClaim);
        } else {
          await requeueProcessingJob(activeJobClaim, activeJob);
        }
      } catch (err) {
        log.error(
          `Failed to hand off processing claim: movieId=${activeJob.movieId}`,
          err,
        );
      }
    }
  }
  await shutdownOtelMetrics().catch((err) =>
    log.error("OTel metrics shutdown failed:", err),
  );
  await closeRedis();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start polling
const verifyMediaTools = async (): Promise<void> => {
  for (const binary of ["ffmpeg", "ffprobe"]) {
    const { stdout } = await execFileAsync(binary, ["-version"], {
      timeout: 5_000,
    });
    log.info(`${binary}: ${stdout.split("\n", 1)[0]}`);
  }
};

const pollPromise = verifyMediaTools()
  .then(() => pollForJobs())
  .catch((error) => {
    log.error("Fatal error:", error);
    process.exit(1);
  });
