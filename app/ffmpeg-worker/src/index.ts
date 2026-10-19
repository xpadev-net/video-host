import { execFile } from "node:child_process";
import { statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sendCallback } from "./callback";
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
import { initOtelMetrics, shutdownOtelMetrics } from "./otel";
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
  getQueueDepths,
  getStaleProcessingJobs,
  MAX_RETRY_COUNT,
  type ProcessingClaim,
  processRetryQueue,
  refreshProcessingJob,
  releaseProcessingJob,
  requeueProcessingJob,
  requeueStaleProcessingJob,
  setEncodeProgress,
} from "./queue";
import {
  deleteFromProd,
  deleteFromTmp,
  downloadFromTmp,
  getTmpObjectSize,
  uploadToProd,
} from "./s3";

const execFileAsync = promisify(execFile);
const HEARTBEAT_FILE = join(TEMP_DIR, "healthy");
const writeHeartbeat = () =>
  writeFile(HEARTBEAT_FILE, `${Date.now()}\n`).catch((error) =>
    log.error("Failed to update worker heartbeat", error),
  );
void writeHeartbeat();
const heartbeatTimer = setInterval(() => void writeHeartbeat(), 15_000);
heartbeatTimer.unref();

log.info("FFmpeg Worker starting...");
log.info(`Commit Hash: ${process.env.COMMIT_HASH || "unknown"}`);

const meter = initOtelMetrics();

const encodeJobs = meter.createCounter("video_host.encode.jobs", {
  description: "Encode jobs processed, by terminal result.",
  unit: "{job}",
});
const encodeJobDuration = meter.createHistogram(
  "video_host.encode.job.duration",
  {
    description: "Time spent processing one encode job.",
    unit: "s",
  },
);
const encodeStageDuration = meter.createHistogram(
  "video_host.encode.stage.duration",
  { description: "Time spent in each encode stage.", unit: "s" },
);
const encodeInputBytes = meter.createHistogram("video_host.encode.input.size", {
  description: "Input media size in bytes.",
  unit: "By",
});
const ffmpegSpeed = meter.createHistogram("video_host.encode.speed", {
  description: "FFmpeg encoding speed relative to realtime.",
  unit: "x",
});
const callbackFailures = meter.createCounter(
  "video_host.encode.callback.failures",
  { description: "Failed backend callbacks.", unit: "{callback}" },
);
const reaperEvents = meter.createCounter("video_host.encode.reaper.events", {
  description: "Processing claims recovered by the reaper.",
  unit: "{claim}",
});
const diskSpace = meter.createObservableGauge("video_host.worker.disk.bytes", {
  description: "Available and total scratch filesystem bytes.",
  unit: "By",
});

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
const retryQueueMoved = meter.createCounter("video_host.encode.queue.moved", {
  description: "Jobs moved from the retry queue back to the main queue.",
  unit: "{job}",
});
meter
  .createObservableGauge("video_host.encode.queue.depth", {
    description: "Jobs waiting in the encode queues.",
    unit: "{job}",
  })
  .addCallback(async (observableResult) => {
    try {
      const { main, retry, processing } = await getQueueDepths();
      observableResult.observe(main, { queue: "main" });
      observableResult.observe(retry, { queue: "retry" });
      observableResult.observe(processing, { queue: "processing" });
    } catch (err) {
      log.error("Failed to observe encode queue depth:", err);
    }
  });
diskSpace.addCallback(async (observableResult) => {
  try {
    const disk = await getDiskSpace();
    observableResult.observe(disk.availableBytes, {
      resource: "scratch",
      state: "available",
    });
    observableResult.observe(disk.totalBytes, {
      resource: "scratch",
      state: "total",
    });
  } catch (err) {
    log.error("Failed to observe scratch disk space:", err);
  }
});

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

// Bound the graceful drain so a stalled job/callback cannot hang SIGTERM.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

// After aborting the in-flight job, give its own failure handling a bounded
// window to retry/requeue it through the normal path.
const SHUTDOWN_SETTLE_TIMEOUT_MS = 10_000;

// Aborted on shutdown so the in-flight job stops via the normal failure
// path instead of running alongside a requeued copy on another worker.
const jobShutdownAbort = new AbortController();

// Claims older than JOB_TIMEOUT + margin belong to a worker that died
// mid-job (SIGKILL, crash) — live jobs are bounded by the job timeout.
const PROCESSING_JOB_LEASE_MS = 5 * 60 * 1000;
const PROCESSING_JOB_HEARTBEAT_MS = 30 * 1000;
const DISK_SPACE_MARGIN_BYTES = 512 * 1024 * 1024;
const DISK_SPACE_MULTIPLIER = 2.5;
let reaperInFlight = false;

const finalizeCommittedClaim = async (
  member: string,
  job: EncodeJob,
  completion: {
    contentUrl: string;
    duration?: number;
    thumbnailKey?: string;
  },
): Promise<void> => {
  await setEncodeProgress(job.movieId, {
    status: "completed",
    progress: 100,
    duration: completion.duration,
  });
  const result = await sendCallbackObserved({
    movieId: job.movieId,
    variantId: "original",
    status: "success",
    s3Key: job.s3Key,
    contentUrl: completion.contentUrl,
    duration: completion.duration,
    thumbnailKey: completion.thumbnailKey,
  });
  if (result === "rejected") {
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
  }
  await finishProcessingJob(member, job);
};

const runReaper = async (): Promise<void> => {
  if (reaperInFlight || isShuttingDown) return;
  reaperInFlight = true;
  try {
    await reapStaleProcessingJobs();
  } finally {
    reaperInFlight = false;
  }
};

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

// Reaper: recover claims whose owner died mid-job. Committed claims carry
// their outcome (input already deleted, so re-encoding is impossible) and
// are finalized via progress + callback; others are requeued atomically.
const reapStaleProcessingJobs = async (): Promise<void> => {
  const staleMembers = await getStaleProcessingJobs(
    Date.now() - PROCESSING_JOB_LEASE_MS,
  );
  for (const member of staleMembers) {
    let claim: ProcessingClaim;
    try {
      claim = JSON.parse(member) as ProcessingClaim;
    } catch (err) {
      log.error("Dropping malformed processing claim:", err);
      reaperEvents.add(1, { action: "drop_malformed" });
      await releaseProcessingJob(member).catch(() => {});
      continue;
    }
    const { job } = claim;
    // The completion record (24h) is authoritative: it outlives the claim
    // lease, so a committed outcome is never re-queued as an encode job.
    const completion =
      (await getJobCompletion(job.movieId, job.s3Key).catch(() => null)) ??
      claim.completion;
    if (!completion) {
      const progress = await getEncodeProgress(job.movieId).catch(() => null);
      if (progress?.status === "failed") {
        await releaseProcessingJob(member).catch(() => {});
        continue;
      }
      if (progress?.status === "completed") {
        try {
          await finalizeCommittedClaim(member, job, {
            contentUrl: getVodContentUrl(job.s3Key),
            duration: progress.duration,
          });
          reaperEvents.add(1, { action: "finalize" });
          log.info(
            `Finalized completed job from stale claim: movieId=${job.movieId}`,
          );
        } catch (err) {
          log.error(
            `Failed to finalize completed stale claim: movieId=${job.movieId}`,
            err,
          );
        }
        continue;
      }
    }
    if (completion) {
      try {
        await finalizeCommittedClaim(member, job, completion);
        reaperEvents.add(1, { action: "finalize" });
        log.info(`Finalized job from stale claim: movieId=${job.movieId}`);
      } catch (err) {
        // Leave the claim in place so a later reap retries it.
        log.error(
          `Failed to finalize stale processing claim: movieId=${job.movieId}`,
          err,
        );
      }
      continue;
    }
    try {
      const requeued = await requeueStaleProcessingJob(member);
      if (requeued) {
        reaperEvents.add(1, { action: "requeue" });
        log.info(`Requeued job from stale claim: movieId=${job.movieId}`);
      }
    } catch (err) {
      log.error(
        `Failed to requeue stale processing claim: movieId=${job.movieId}`,
        err,
      );
    }
  }
};

const getDiskSpace = async (): Promise<{
  availableBytes: number;
  totalBytes: number;
}> => {
  const space = await statfs(TEMP_DIR);
  return {
    availableBytes: Number(space.bavail) * Number(space.bsize),
    totalBytes: Number(space.blocks) * Number(space.bsize),
  };
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

const measureStage = async <T>(
  job: EncodeJob,
  stage: "downloading" | "encoding" | "uploading" | "deleting",
  callback: () => Promise<T>,
): Promise<T> => {
  await setEncodeProgress(job.movieId, {
    status: "processing",
    stage,
    progress: stage === "downloading" ? 0 : undefined,
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
  activeJobAbortController = abortController;
  const onShutdownAbort = () => abortController.abort();
  if (jobShutdownAbort.signal.aborted) {
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

    if (!result.success && jobTimedOut) result.kind = "timeout";

    if (jobRelinquished) {
      return "relinquished";
    }

    if (!result.success) {
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

    log.info(`Deleting from tmp-bucket: ${job.s3Key}`);
    await measureStage(job, "deleting", () =>
      deleteFromTmp(job.s3Key, abortController.signal),
    );

    // Generate content URL for VOD streaming
    const contentUrl = getVodContentUrl(job.s3Key);

    // The input is gone: if this worker dies now the job can no longer be
    // re-encoded, so mark the claim with its outcome for the reaper. A
    // failure here must not send the job down the retry path.
    committedOutcome = {
      contentUrl,
      duration: result.duration,
      thumbnailKey: uploadedThumbnailKey,
    };
    activeJobCommitted = true;
    if (activeJobClaim) {
      try {
        activeJobClaim = await commitProcessingJob(activeJobClaim, job, {
          contentUrl,
          duration: result.duration,
          thumbnailKey: uploadedThumbnailKey,
        });
      } catch (claimError) {
        log.error(
          `Failed to mark processing claim committed: movieId=${job.movieId}`,
          claimError,
        );
      }
    }

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
    if (
      jobShutdownAbort.signal.aborted &&
      !committedOutcome &&
      activeJobClaim
    ) {
      jobRelinquished = true;
      const requeued = await requeueProcessingJob(activeJobClaim, job);
      if (!requeued) {
        log.warn(`Shutdown claim already handed off: movieId=${job.movieId}`);
      }
      return "relinquished";
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
    const timedOut =
      abortController.signal.aborted && !jobShutdownAbort.signal.aborted;
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
  // Process retry queue periodically (every 10 seconds)
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
        await runReaper();
      } catch (error) {
        log.error("Error reaping stale processing jobs:", error);
      }
    } else {
      clearInterval(retryQueueInterval);
    }
  }, 10000);

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
    await runReaper();
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
  clearInterval(heartbeatTimer);
  // Wait for the in-flight job (if any) so its result metrics, progress
  // updates and callbacks are sent before the provider is shut down.
  await Promise.race([
    pollPromise,
    new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS)),
  ]);
  // If the drain timed out mid-job, abort it so its own failure handling
  // puts it back on the retry queue. Requeueing while it still runs would
  // let a second worker process the same job concurrently.
  if (activeJob) {
    log.warn(
      `Aborting in-flight job on shutdown: movieId=${activeJob.movieId}`,
    );
    jobShutdownAbort.abort();
    await Promise.race([
      pollPromise,
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_SETTLE_TIMEOUT_MS)),
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
