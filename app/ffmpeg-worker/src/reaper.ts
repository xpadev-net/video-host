import type { CallbackPayload, CallbackResult } from "./callback";
import { PROCESSING_JOB_LEASE_MS } from "./config";
import { getVodContentUrl } from "./env";
import { createJobFinalizer } from "./job-finalizer";
import { log, withLogContext } from "./logger";
import { reaperEvents } from "./metrics";
import {
  finishProcessingJob,
  getEncodeProgress,
  getJobCompletion,
  getStaleProcessingJobs,
  type ProcessingClaim,
  type ProcessingClaimCompletion,
  ProcessingClaimSchema,
  releaseProcessingJob,
  requeueStaleProcessingJob,
  setEncodeProgress,
} from "./queue";
import { deleteFromProd } from "./s3";

type SendCallbackObserved = (
  payload: CallbackPayload,
) => Promise<CallbackResult>;

export const createReaper = (sendCallbackObserved: SendCallbackObserved) => {
  let reaperInFlight = false;
  const jobFinalizer = createJobFinalizer({
    setProgress: setEncodeProgress,
    callback: sendCallbackObserved,
    deleteOutput: deleteFromProd,
  });

  const finalizeCommittedClaim = async (
    member: string,
    job: ProcessingClaim["job"],
    completion: ProcessingClaimCompletion,
  ): Promise<void> => {
    await jobFinalizer.finalizeSuccess(job, completion);
    await finishProcessingJob(member, job);
  };

  const reapStaleProcessingJobs = async (): Promise<void> => {
    const staleMembers = await getStaleProcessingJobs(
      Date.now() - PROCESSING_JOB_LEASE_MS,
    );
    for (const member of staleMembers) {
      let claim: ProcessingClaim;
      try {
        claim = ProcessingClaimSchema.parse(JSON.parse(member));
      } catch (error) {
        log.error("Dropping malformed processing claim", error);
        reaperEvents.add(1, { action: "drop_malformed" });
        await releaseProcessingJob(member).catch(() => {});
        continue;
      }

      await withLogContext(
        log.child({
          movieId: claim.job.movieId,
          claimId: claim.claimId,
          retryCount: claim.job.retryCount ?? 0,
          s3Key: claim.job.s3Key,
        }),
        async () => {
          const { job } = claim;
          const completion =
            (await getJobCompletion(job.movieId, job.s3Key).catch(
              () => null,
            )) ?? claim.completion;
          if (!completion) {
            const progress = await getEncodeProgress(job.movieId).catch(
              () => null,
            );
            if (progress?.status === "failed") {
              await releaseProcessingJob(member).catch(() => {});
              return;
            }
            if (progress?.status === "completed") {
              try {
                await finalizeCommittedClaim(member, job, {
                  contentUrl: getVodContentUrl(job.s3Key),
                  duration: progress.duration,
                });
                reaperEvents.add(1, { action: "finalize" });
                log.info("Finalized completed job from stale claim");
              } catch (error) {
                log.error("Failed to finalize completed stale claim", error);
              }
              return;
            }
          }

          if (completion) {
            try {
              await finalizeCommittedClaim(member, job, completion);
              reaperEvents.add(1, { action: "finalize" });
              log.info("Finalized job from stale claim");
            } catch (error) {
              log.error("Failed to finalize stale processing claim", error);
            }
            return;
          }

          try {
            const requeued = await requeueStaleProcessingJob(member);
            if (requeued) {
              reaperEvents.add(1, { action: "requeue" });
              log.info("Requeued job from stale claim");
            }
          } catch (error) {
            log.error("Failed to requeue stale processing claim", error);
          }
        },
      );
    }
  };

  const runReaper = async (isShuttingDown: boolean): Promise<void> => {
    if (reaperInFlight || isShuttingDown) return;
    reaperInFlight = true;
    try {
      await reapStaleProcessingJobs();
    } finally {
      reaperInFlight = false;
    }
  };

  return { finalizeCommittedClaim, runReaper };
};
