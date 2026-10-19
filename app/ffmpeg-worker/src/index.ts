import { execFile } from "child_process";
import { promisify } from "util";
import { sendCallback } from "./callback";
import { cleanup, encodeVideo, getLocalPath } from "./encoder";
import {
  getVodContentUrl,
  JOB_TIMEOUT_SECONDS,
  MIN_DISK_SPACE_GB,
  TEMP_DIR,
} from "./env";
import { getMeter, initOtelMetrics } from "./otel";
import {
  addJobToRetryQueue,
  claimProcessingJob,
  closeRedis,
  commitProcessingJob,
  type EncodeJob,
  expireProcessingJob,
  finishProcessingJob,
  getEncodeJobBlocking,
  getEncodeProgress,
  getJobCompletion,
  getQueueDepths,
  getStaleProcessingJobs,
  type ProcessingClaim,
  processRetryQueue,
  releaseProcessingJob,
  requeueInterruptedJob,
  requeueStaleProcessingJob,
  setEncodeProgress,
} from "./queue";
import { deleteFromTmp, downloadFromTmp, uploadToProd } from "./s3";

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

// The whole shutdown has to fit inside the pod's terminationGracePeriodSeconds
// (90 s): drain/settle below, ffmpeg's own 5 s SIGKILL escalation, then the
// claim handoff and telemetry flush. Worst case here is about 20 + 5 + 5 s.

// A job whose output is already committed can only be finalized (callback), so
// it is given this long to finish instead of being aborted.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000;

// After aborting the in-flight job, give its own handling a bounded window to
// put it back on the queue.
const SHUTDOWN_SETTLE_TIMEOUT_MS = 15_000;

// Why a job was aborted. A shutdown requeues the job without consuming a
// retry; a timeout goes down the normal retry path.
const ABORT_SHUTDOWN = "shutdown";
const ABORT_TIMEOUT = "timeout";

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
    const { job } = claim;
    // The completion record (24h) is authoritative: it outlives the claim
    // lease, so a committed outcome is never re-queued as an encode job.
    const completion =
      (await getJobCompletion(job.movieId).catch(() => null)) ??
      claim.completion;
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
            contentUrl: getVodContentUrl(job.s3Key),
            duration: progress.duration,
          });
          await finishProcessingJob(member, job.movieId);
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
          duration: completion.duration,
        });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "success",
          s3Key: job.s3Key,
          contentUrl: completion.contentUrl,
          duration: completion.duration,
        });
        await finishProcessingJob(member, job.movieId);
        console.log(`Finalized job from stale claim: movieId=${job.movieId}`);
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
        console.log(`Requeued job from stale claim: movieId=${job.movieId}`);
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
      console.warn(
        "Could not parse df output, assuming disk space is available",
      );
      return true;
    }

    // Parse the output: Filesystem 1K-blocks Used Available Use% Mounted on
    // or: Filesystem 1B-blocks Used Available Use% Mounted on
    const parts = lines[1].trim().split(/\s+/);
    if (parts.length < 4) {
      console.warn(
        "Could not parse df output, assuming disk space is available",
      );
      return true;
    }

    // Available space in bytes (3rd column when using -B1)
    const availableBytes = parseInt(parts[3], 10);
    if (Number.isNaN(availableBytes)) {
      console.warn(
        "Could not parse available disk space, assuming disk space is available",
      );
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
// A shutdown interrupted this job. Hand it back to the queue untouched; if the
// claim is already gone (a reaper took it) the job belongs to someone else.
const requeueForShutdown = async (job: EncodeJob): Promise<JobResult> => {
  console.warn(
    `Requeueing job interrupted by shutdown: movieId=${job.movieId}`,
  );
  const requeued = await requeueInterruptedJob(job, activeJobClaim);
  if (!requeued) {
    jobRelinquished = true;
    return "relinquished";
  }
  // The claim was released inside the handoff.
  activeJobClaim = null;
  return "requeued";
};

type JobResult =
  | "completed"
  | "failed"
  | "retrying"
  | "requeued"
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
    // A shutdown that overlapped the check is not the job's fault either.
    if (jobShutdownAbort.signal.aborted) {
      return await requeueForShutdown(job);
    }
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
        console.error(
          `Failed to schedule retry: movieId=${job.movieId}`,
          retryError,
        );
        // Fall through to mark as failed
        await setEncodeProgress(job.movieId, {
          status: "failed",
        });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "failed",
          s3Key: job.s3Key,
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
        s3Key: job.s3Key,
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
  let committedOutcome: { contentUrl: string; duration?: number } | null = null;

  // Create abort controller for timeout management
  const abortController = new AbortController();
  const onShutdownAbort = () => abortController.abort(ABORT_SHUTDOWN);
  if (jobShutdownAbort.signal.aborted) {
    abortController.abort(ABORT_SHUTDOWN);
  } else {
    jobShutdownAbort.signal.addEventListener("abort", onShutdownAbort, {
      once: true,
    });
  }
  const timeoutId = setTimeout(() => {
    console.error(
      `Job timeout after ${JOB_TIMEOUT_SECONDS} seconds: movieId=${job.movieId}`,
    );
    abortController.abort(ABORT_TIMEOUT);
  }, JOB_TIMEOUT_SECONDS * 1000);

  // Interrupted by our own shutdown: not a failure of the job, so it goes back
  // to the queue with its retry budget intact.
  const interruptedByShutdown = (): boolean =>
    abortController.signal.aborted &&
    abortController.signal.reason === ABORT_SHUTDOWN &&
    !committedOutcome;

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
      if (interruptedByShutdown()) {
        return await requeueForShutdown(job);
      }
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
          console.error(
            `Failed to schedule retry: movieId=${job.movieId}`,
            retryError,
          );
          // Fall through to mark as failed
        }
      }
      // Max retries exceeded or retry scheduling failed
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
        s3Key: job.s3Key,
      });
      return "failed";
    }

    // Upload to prod-bucket (same key structure)
    console.log(`Uploading to prod-bucket: ${job.s3Key}`);
    await uploadToProd(
      job.s3Key,
      outputPath,
      "video/mp4",
      abortController.signal,
    );

    // Generate content URL for VOD streaming
    const contentUrl = getVodContentUrl(job.s3Key);

    // The output is in prod: record the outcome on the claim BEFORE touching
    // the tmp input. If this worker dies or is cut off from here on (even in
    // the middle of the delete), the reaper replays the success callback
    // instead of re-encoding an input that may already be gone. A failure
    // here must not send the job down the retry path.
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

    // Delete from tmp-bucket. The outcome is already recorded, so a failure
    // only leaves an orphaned input behind.
    console.log(`Deleting from tmp-bucket: ${job.s3Key}`);
    try {
      await deleteFromTmp(job.s3Key);
    } catch (deleteError) {
      console.error(
        `Failed to delete tmp input (left orphaned): movieId=${job.movieId}`,
        deleteError,
      );
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
          duration: committedOutcome.duration,
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
    try {
      if (interruptedByShutdown()) {
        return await requeueForShutdown(job);
      }
    } catch (requeueError) {
      console.error(
        `Failed to requeue interrupted job: movieId=${job.movieId}`,
        requeueError,
      );
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
        console.error(
          `Failed to schedule retry for job: movieId=${job.movieId}`,
          retryError,
        );
        // If retry scheduling fails, mark as failed
        try {
          await setEncodeProgress(job.movieId, { status: "failed" });
          await sendCallback({
            movieId: job.movieId,
            variantId: "original",
            status: "failed",
            s3Key: job.s3Key,
          });
        } catch (finalError) {
          console.error(
            `Failed to mark job as failed: movieId=${job.movieId}`,
            finalError,
          );
        }
      }
    } else {
      // Max retries exceeded
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
        s3Key: job.s3Key,
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
      if (job && isShuttingDown) {
        // Popped while SIGTERM was being handled: not started, so hand it
        // straight back instead of encoding through the shutdown window.
        await requeueInterruptedJob(job, null);
        break;
      }
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
        // The job may already have a recorded outcome (input deleted, then
        // requeued by a stale claim): finalize instead of re-encoding.
        const priorCompletion = await getJobCompletion(job.movieId).catch(
          () => null,
        );
        if (priorCompletion) {
          activeJobCommitted = true;
          try {
            await setEncodeProgress(job.movieId, {
              status: "completed",
              progress: 100,
              duration: priorCompletion.duration,
            });
            await sendCallback({
              movieId: job.movieId,
              variantId: "original",
              status: "success",
              s3Key: job.s3Key,
              contentUrl: priorCompletion.contentUrl,
              duration: priorCompletion.duration,
            });
          } catch (finalizeError) {
            console.error(
              `Failed to finalize already-completed job: movieId=${job.movieId}`,
              finalizeError,
            );
          }
          if (activeJobClaim) {
            try {
              await finishProcessingJob(activeJobClaim, job.movieId);
            } catch (finishError) {
              console.error(
                `Failed to release processing claim: movieId=${job.movieId}`,
                finishError,
              );
            }
          }
          encodeJobs.add(1, { result: "completed" });
          encodeJobDuration.record((performance.now() - jobStartedAt) / 1000, {
            result: "completed",
          });
          activeJob = null;
          activeJobClaim = null;
          activeJobCommitted = false;
          continue;
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
              s3Key: job.s3Key,
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
            !jobRelinquished && (!activeJobCommitted || result === "completed");
          if (activeJobClaim && claimResolved) {
            try {
              if (result === "completed") {
                await finishProcessingJob(activeJobClaim, job.movieId);
              } else {
                await releaseProcessingJob(activeJobClaim);
              }
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
        encodeJobDuration.record((performance.now() - jobStartedAt) / 1000, {
          result,
        });
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
  // Anything still encoding (or about to start) is stopped right away and put
  // back on the queue: waiting for it would just burn the grace period. A job
  // that already committed its output can only be finalized, so it is allowed to
  // finish.
  const finalizing = activeJob !== null && activeJobCommitted;
  if (!finalizing) {
    if (activeJob) {
      console.warn(
        `Aborting in-flight job on shutdown: movieId=${activeJob.movieId}`,
      );
    }
    jobShutdownAbort.abort(ABORT_SHUTDOWN);
  }
  // Wait for the job (if any) so its result metrics, progress updates and
  // callbacks are sent before the provider is shut down.
  await Promise.race([
    pollPromise,
    new Promise((resolve) =>
      setTimeout(
        resolve,
        finalizing ? SHUTDOWN_DRAIN_TIMEOUT_MS : SHUTDOWN_SETTLE_TIMEOUT_MS,
      ),
    ),
  ]);
  // If a finalizing job is still stuck, abort it too and give its own
  // handling one more short window before relinquishing.
  if (activeJob && finalizing) {
    jobShutdownAbort.abort(ABORT_SHUTDOWN);
    await Promise.race([
      pollPromise,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
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
