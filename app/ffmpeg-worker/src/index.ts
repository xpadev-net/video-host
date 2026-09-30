import { VOD_BASE_URL, TEMP_DIR, MIN_DISK_SPACE_GB, JOB_TIMEOUT_SECONDS } from "./env";
import {
  getEncodeJobBlocking,
  closeRedis,
  type EncodeJob,
  type ProcessingClaim,
  setEncodeProgress,
  getEncodeProgress,
  addJobToRetryQueue,
  processRetryQueue,
  getQueueDepths,
  claimProcessingJob,
  commitProcessingJob,
  releaseProcessingJob,
  expireProcessingJob,
  getStaleProcessingJobs,
  requeueStaleProcessingJob,
} from "./queue";
import { downloadFromTmp, uploadToProd, deleteFromTmp } from "./s3";
import { encodeVideo, getLocalPath, cleanup } from "./encoder";
import { sendCallback } from "./callback";
import { initOtelMetrics, getMeter } from "./otel";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

console.log("FFmpeg Worker starting...");
console.log(`Commit Hash: ${process.env.COMMIT_HASH || "unknown"}`);

const metricProvider = initOtelMetrics();
const meter = getMeter();

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
      const { main, retry } = await getQueueDepths();
      observableResult.observe(main, { queue: "main" });
      observableResult.observe(retry, { queue: "retry" });
    } catch (err) {
      console.error("Failed to observe encode queue depth:", err);
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
const PROCESSING_JOB_LEASE_MS = JOB_TIMEOUT_SECONDS * 1000 + 15 * 60 * 1000;

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
      console.error("Dropping malformed processing claim:", err);
      await releaseProcessingJob(member).catch(() => {});
      continue;
    }
    const { job, completion } = claim;
    // A claim without a recorded completion may still belong to a job that
    // finished (e.g. its commit write failed): check the terminal progress
    // state so we never requeue a video whose input is already gone.
    if (!completion) {
      const progress = await getEncodeProgress(job.movieId).catch(() => null);
      if (progress?.status === "failed") {
        await releaseProcessingJob(member).catch(() => {});
        continue;
      }
      if (progress?.status === "completed") {
        try {
          await sendCallback({
            movieId: job.movieId,
            variantId: "original",
            status: "success",
            s3Key: job.s3Key,
            contentUrl: `${VOD_BASE_URL}/vod/${job.s3Key}/master.m3u8`,
          });
          await releaseProcessingJob(member);
          console.log(
            `Finalized completed job from stale claim: movieId=${job.movieId}`,
          );
        } catch (err) {
          console.error(
            `Failed to finalize completed stale claim: movieId=${job.movieId}`,
            err,
          );
        }
        continue;
      }
    }
    if (completion) {
      try {
        await setEncodeProgress(job.movieId, {
          status: "completed",
          progress: 100,
        });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "success",
          s3Key: job.s3Key,
          contentUrl: completion.contentUrl,
          duration: completion.duration,
        });
        await releaseProcessingJob(member);
        console.log(
          `Finalized job from stale claim: movieId=${job.movieId}`,
        );
      } catch (err) {
        // Leave the claim in place so a later reap retries it.
        console.error(
          `Failed to finalize stale processing claim: movieId=${job.movieId}`,
          err,
        );
      }
      continue;
    }
    try {
      const requeued = await requeueStaleProcessingJob(member);
      if (requeued) {
        console.log(
          `Requeued job from stale claim: movieId=${job.movieId}`,
        );
      }
    } catch (err) {
      console.error(
        `Failed to requeue stale processing claim: movieId=${job.movieId}`,
        err,
      );
    }
  }
};

const checkDiskSpace = async (): Promise<boolean> => {
  try {
    // Use df command to check available disk space
    // df -BG outputs in GB, -B1 outputs in bytes (more reliable)
    // Use execFile with args array to prevent shell injection
    const { stdout } = await execFileAsync("df", ["-B1", TEMP_DIR]);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) {
      console.warn("Could not parse df output, assuming disk space is available");
      return true;
    }

    // Parse the output: Filesystem 1K-blocks Used Available Use% Mounted on
    // or: Filesystem 1B-blocks Used Available Use% Mounted on
    const parts = lines[1].trim().split(/\s+/);
    if (parts.length < 4) {
      console.warn("Could not parse df output, assuming disk space is available");
      return true;
    }

    // Available space in bytes (3rd column when using -B1)
    const availableBytes = parseInt(parts[3], 10);
    if (Number.isNaN(availableBytes)) {
      console.warn("Could not parse available disk space, assuming disk space is available");
      return true;
    }

    const availableGB = availableBytes / (1024 * 1024 * 1024);
    const hasEnoughSpace = availableGB >= MIN_DISK_SPACE_GB;

    if (!hasEnoughSpace) {
      console.warn(
        `Insufficient disk space: ${availableGB.toFixed(2)}GB available, ${MIN_DISK_SPACE_GB}GB required`,
      );
    }

    return hasEnoughSpace;
  } catch (error) {
    console.error("Error checking disk space:", error);
    // On error, assume disk space is available to avoid blocking jobs
    // This is a fail-open approach
    return true;
  }
};

// "error" marks unexpected processJob rejections (no confirmed terminal
// outcome), distinct from handled "failed" paths. "relinquished" marks a
// job whose ownership was transferred to the queue during shutdown.
type JobResult =
  | "completed"
  | "failed"
  | "retrying"
  | "error"
  | "relinquished";

const processJob = async (job: EncodeJob): Promise<JobResult> => {
  console.log(`Processing job: movieId=${job.movieId}, s3Key=${job.s3Key}`);

  // Check disk space before processing
  const hasEnoughSpace = await checkDiskSpace();
  if (jobRelinquished) {
    return "relinquished";
  }
  if (!hasEnoughSpace) {
    console.error(
      `Insufficient disk space for job: movieId=${job.movieId}, scheduling retry`,
    );
    // Schedule retry for later
    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      try {
        await addJobToRetryQueue(job);
        await setEncodeProgress(job.movieId, {
          status: "retrying",
        });
        return "retrying";
      } catch (retryError) {
        console.error(`Failed to schedule retry: movieId=${job.movieId}`, retryError);
        // Fall through to mark as failed
        await setEncodeProgress(job.movieId, {
          status: "failed",
        });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "failed",
        });
      }
    } else {
      await setEncodeProgress(job.movieId, {
        status: "failed",
      });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
    }
    return "failed";
  }

  if (jobRelinquished) {
    return "relinquished";
  }

  // Set status to processing
  await setEncodeProgress(job.movieId, { status: "processing", progress: 0 });

  const inputPath = getLocalPath(job.s3Key, "_input");
  const outputPath = getLocalPath(job.s3Key, "_output.mp4");
  const filesToCleanup = [inputPath, outputPath];

  // Set once the tmp input is deleted: past that point the job can only be
  // finalized as success — re-encoding is impossible, so errors in the
  // finalize steps must never fall into the retry/failed path.
  let committedOutcome: { contentUrl: string; duration?: number } | null =
    null;

  // Create abort controller for timeout management
  const abortController = new AbortController();
  const onShutdownAbort = () => abortController.abort();
  if (jobShutdownAbort.signal.aborted) {
    abortController.abort();
  } else {
    jobShutdownAbort.signal.addEventListener("abort", onShutdownAbort, {
      once: true,
    });
  }
  const timeoutId = setTimeout(() => {
    console.error(
      `Job timeout after ${JOB_TIMEOUT_SECONDS} seconds: movieId=${job.movieId}`,
    );
    abortController.abort();
  }, JOB_TIMEOUT_SECONDS * 1000);

  try {
    // Download from tmp-bucket
    console.log(`Downloading from tmp-bucket: ${job.s3Key}`);
    await downloadFromTmp(job.s3Key, inputPath, abortController.signal);

    // Encode video with progress callback and abort signal
    console.log(`Encoding video to: ${outputPath}`);
    const result = await encodeVideo(
      inputPath,
      outputPath,
      async (progress) => {
        if (jobRelinquished) {
          return;
        }
        // Update progress in Redis
        await setEncodeProgress(job.movieId, {
          status: "processing",
          progress: progress.percent,
          currentTime: progress.currentTime,
          duration: progress.duration,
        });
      },
      abortController.signal,
    );

    if (jobRelinquished) {
      return "relinquished";
    }

    if (!result.success) {
      console.error(`Encoding failed: ${result.error}`);
      // Try to retry the job
      const retryCount = job.retryCount || 0;
      if (retryCount < 3) {
        console.log(
          `Scheduling retry for job: movieId=${job.movieId}, retryCount=${retryCount + 1}`,
        );
        try {
          await addJobToRetryQueue(job);
          await setEncodeProgress(job.movieId, {
            status: "retrying",
          });
          return "retrying";
        } catch (retryError) {
          console.error(`Failed to schedule retry: movieId=${job.movieId}`, retryError);
          // Fall through to mark as failed
        }
      }
      // Max retries exceeded or retry scheduling failed
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
      return "failed";
    }

    // Upload to prod-bucket (same key structure)
    console.log(`Uploading to prod-bucket: ${job.s3Key}`);
    await uploadToProd(job.s3Key, outputPath, "video/mp4", abortController.signal);

    // Delete from tmp-bucket
    console.log(`Deleting from tmp-bucket: ${job.s3Key}`);
    await deleteFromTmp(job.s3Key);

    // Generate content URL for VOD streaming
    const contentUrl = `${VOD_BASE_URL}/vod/${job.s3Key}/master.m3u8`;

    // The input is gone: if this worker dies now the job can no longer be
    // re-encoded, so mark the claim with its outcome for the reaper. A
    // failure here must not send the job down the retry path.
    committedOutcome = { contentUrl, duration: result.duration };
    activeJobCommitted = true;
    if (activeJobClaim) {
      try {
        activeJobClaim = await commitProcessingJob(activeJobClaim, job, {
          contentUrl,
          duration: result.duration,
        });
      } catch (claimError) {
        console.error(
          `Failed to mark processing claim committed: movieId=${job.movieId}`,
          claimError,
        );
      }
    }

    if (jobRelinquished) {
      return "relinquished";
    }

    // Set status to completed
    await setEncodeProgress(job.movieId, { status: "completed", progress: 100 });

    // Send success callback
    await sendCallback({
      movieId: job.movieId,
      variantId: "original",
      status: "success",
      s3Key: job.s3Key,
      contentUrl,
      duration: result.duration,
    });

    console.log(`Job completed successfully: movieId=${job.movieId}`);
    return "completed";
  } catch (error) {
    if (jobRelinquished) {
      return "relinquished";
    }
    if (committedOutcome) {
      // Input is already deleted — an encode retry would fail to download
      // it. Finalize as success instead of re-encoding.
      console.error(
        `Job failed after commit, finalizing as completed: movieId=${job.movieId}`,
        error,
      );
      try {
        await setEncodeProgress(job.movieId, {
          status: "completed",
          progress: 100,
        });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "success",
          s3Key: job.s3Key,
          contentUrl: committedOutcome.contentUrl,
          duration: committedOutcome.duration,
        });
        return "completed";
      } catch (finalizeError) {
        console.error(
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
            console.error(
              `Failed to persist committed claim: movieId=${job.movieId}`,
              claimError,
            );
          }
        }
        return "error";
      }
    }
    console.error(`Job failed: movieId=${job.movieId}`, error);
    // Try to retry the job
    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      console.log(
        `Scheduling retry for job: movieId=${job.movieId}, retryCount=${retryCount + 1}`,
      );
      try {
        await addJobToRetryQueue(job);
        await setEncodeProgress(job.movieId, {
          status: "retrying",
        });
        return "retrying";
      } catch (retryError) {
        console.error(`Failed to schedule retry for job: movieId=${job.movieId}`, retryError);
        // If retry scheduling fails, mark as failed
        try {
          await setEncodeProgress(job.movieId, { status: "failed" });
          await sendCallback({
            movieId: job.movieId,
            variantId: "original",
            status: "failed",
          });
        } catch (finalError) {
          console.error(`Failed to mark job as failed: movieId=${job.movieId}`, finalError);
        }
      }
    } else {
      // Max retries exceeded
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
    }
    return "failed";
  } finally {
    // Clear timeout if job completed before timeout
    clearTimeout(timeoutId);
    jobShutdownAbort.signal.removeEventListener("abort", onShutdownAbort);
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
        console.error("Error processing retry queue:", error);
      }
      try {
        await reapStaleProcessingJobs();
      } catch (error) {
        console.error("Error reaping stale processing jobs:", error);
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
    console.error("Error processing retry queue at startup:", error);
  }

  // Recover claims left behind by workers that died mid-job.
  try {
    await reapStaleProcessingJobs();
  } catch (error) {
    console.error("Error reaping stale processing jobs at startup:", error);
  }

  while (!isShuttingDown) {
    try {
      // Use blocking pop with 5 second timeout
      const job = await getEncodeJobBlocking(5);
      if (job) {
        const jobStartedAt = performance.now();
        activeJob = job;
        jobRelinquished = false;
        try {
          activeJobClaim = await claimProcessingJob(job);
        } catch (claimError) {
          console.error(
            `Failed to record processing claim: movieId=${job.movieId}`,
            claimError,
          );
        }
        let result: JobResult = "error";
        try {
          result = await processJob(job);
        } catch (error) {
          console.error(
            `Job processing threw unexpectedly: movieId=${job.movieId}`,
            error,
          );
          // Best-effort terminal notification so the backend does not wait
          // on "processing" forever; the job is already out of the queue.
          try {
            await setEncodeProgress(job.movieId, { status: "failed" });
            await sendCallback({
              movieId: job.movieId,
              variantId: "original",
              status: "failed",
            });
          } catch (notifyError) {
            console.error(
              `Failed to report job failure: movieId=${job.movieId}`,
              notifyError,
            );
          }
          result = "error";
        } finally {
          // Relinquished claims are owned by the queue again: releasing
          // them here could delete a claim another worker just took. A
          // committed job that failed to finalize keeps its claim so the
          // reaper can finish it instead of losing an uploaded video.
          const claimResolved =
            !jobRelinquished &&
            (!activeJobCommitted || result === "completed");
          if (activeJobClaim && claimResolved) {
            try {
              await releaseProcessingJob(activeJobClaim);
            } catch (releaseError) {
              console.error(
                `Failed to release processing claim: movieId=${job.movieId}`,
                releaseError,
              );
            }
          }
          activeJob = null;
          activeJobClaim = null;
          activeJobCommitted = false;
        }
        encodeJobs.add(1, { result });
        encodeJobDuration.record(
          (performance.now() - jobStartedAt) / 1000,
          { result },
        );
      }
      // If no job, brPop will timeout and return null, then loop continues
    } catch (error) {
      console.error("Error polling for jobs:", error);
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
  console.log("Shutting down...");
  isShuttingDown = true;
  // Wait for the in-flight job (if any) so its result metrics, progress
  // updates and callbacks are sent before the provider is shut down.
  await Promise.race([
    pollPromise,
    new Promise((resolve) =>
      setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS),
    ),
  ]);
  // If the drain timed out mid-job, abort it so its own failure handling
  // puts it back on the retry queue. Requeueing while it still runs would
  // let a second worker process the same job concurrently.
  if (activeJob) {
    console.warn(
      `Aborting in-flight job on shutdown: movieId=${activeJob.movieId}`,
    );
    jobShutdownAbort.abort();
    await Promise.race([
      pollPromise,
      new Promise((resolve) =>
        setTimeout(resolve, SHUTDOWN_SETTLE_TIMEOUT_MS),
      ),
    ]);
  }
  // Last resort: the job did not settle even after abort (e.g. stuck in a
  // non-abortable await). Relinquish it — its remaining terminal writes are
  // skipped — and expire the claim so another worker's reaper hands it off:
  // committed claims are finalized via callback, others are requeued.
  if (activeJob) {
    console.warn(
      `Relinquishing in-flight job on shutdown: movieId=${activeJob.movieId}`,
    );
    jobRelinquished = true;
    if (activeJobClaim) {
      try {
        await expireProcessingJob(activeJobClaim);
      } catch (err) {
        console.error(
          `Failed to expire processing claim: movieId=${activeJob.movieId}`,
          err,
        );
      }
    }
  }
  await metricProvider
    ?.shutdown()
    .catch((err) => console.error("OTel metrics shutdown failed:", err));
  await closeRedis();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start polling
const pollPromise = pollForJobs().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
