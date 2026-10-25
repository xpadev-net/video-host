import { RETRY_QUEUE_POLL_INTERVAL_MS } from "./config";
import { getDiskSpace } from "./disk";
import { MIN_DISK_SPACE_GB, POLL_INTERVAL_MS } from "./env";
import type { JobContext, JobResult } from "./job-runner";
import { log, withLogContext } from "./logger";
import { encodeJobDuration, encodeJobs, retryQueueMoved } from "./metrics";
import {
  claimNextEncodeJob,
  type EncodeJob,
  finishProcessingJob,
  getJobCompletion,
  processRetryQueue,
  releaseProcessingJob,
} from "./queue";

export interface WorkerLoopState {
  isShuttingDown: boolean;
  activeJob: EncodeJob | null;
  activeJobClaim: string | null;
  activeJobCommitted: boolean;
  jobRelinquished: boolean;
  activeJobAbortController: AbortController | null;
}
export interface WorkerLoopDependencies {
  shutdownSignal: AbortSignal;
  writeReadiness(): Promise<void>;
  startLeaseHeartbeat(member: string, job: EncodeJob, claimId: string): void;
  stopLeaseHeartbeat(): void;
  runReaper(shuttingDown: boolean): Promise<unknown>;
  finalizeCommittedClaim(
    member: string,
    job: EncodeJob,
    completion: NonNullable<Awaited<ReturnType<typeof getJobCompletion>>>,
  ): Promise<void>;
  markJobFailed(job: EncodeJob, reason: string): Promise<void>;
  processJob(job: EncodeJob, context: JobContext): Promise<JobResult>;
}

export const runWorkerLoop = async (
  state: WorkerLoopState,
  deps: WorkerLoopDependencies,
): Promise<void> => {
  // Process retry queue periodically to move due jobs back to the main queue.
  const retryQueueInterval = setInterval(async () => {
    if (!state.isShuttingDown) {
      try {
        const moved = await processRetryQueue();
        if (moved > 0) {
          retryQueueMoved.add(moved);
        }
      } catch (error) {
        log.error("Error processing retry queue:", error);
      }
      try {
        await deps.runReaper(state.isShuttingDown);
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
    await deps.runReaper(state.isShuttingDown);
  } catch (error) {
    log.error("Error reaping stale processing jobs at startup:", error);
  }

  while (!state.isShuttingDown) {
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
      await deps.writeReadiness();
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
      state.activeJob = job;
      state.activeJobClaim = claim.member;
      state.activeJobCommitted = false;
      state.jobRelinquished = false;
      deps.startLeaseHeartbeat(claim.member, job, claim.claimId);

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
            state.activeJobCommitted = true;
            await deps.finalizeCommittedClaim(
              claim.member,
              job,
              priorCompletion,
            );
            return "completed";
          }
          return deps.processJob(job, {
            shutdownSignal: deps.shutdownSignal,
            get activeJobClaim() {
              return state.activeJobClaim;
            },
            set activeJobClaim(value) {
              state.activeJobClaim = value;
            },
            get activeJobCommitted() {
              return state.activeJobCommitted;
            },
            set activeJobCommitted(value) {
              state.activeJobCommitted = value;
            },
            get jobRelinquished() {
              return state.jobRelinquished;
            },
            set jobRelinquished(value) {
              state.jobRelinquished = value;
            },
            getAbortController: () => state.activeJobAbortController,
            setAbortController: (value) => {
              state.activeJobAbortController = value;
            },
          });
        });
      } catch (error) {
        await withLogContext(jobLogger, async () => {
          log.error("Job processing threw unexpectedly", error);
          try {
            await deps.markJobFailed(
              job,
              `Unexpected worker error: ${String(error)}`,
            );
          } catch (notifyError) {
            log.error("Failed to report job failure", notifyError);
          }
        });
        result = "error";
      } finally {
        deps.stopLeaseHeartbeat();
        const claimResolved =
          !state.jobRelinquished &&
          (!state.activeJobCommitted ||
            result === "completed" ||
            result === "failed");
        if (claimResolved) {
          try {
            if (state.activeJobCommitted || result === "completed") {
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
        state.activeJob = null;
        state.activeJobClaim = null;
        state.activeJobAbortController = null;
        state.activeJobCommitted = false;
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
