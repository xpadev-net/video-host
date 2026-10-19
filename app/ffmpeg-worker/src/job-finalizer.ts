import type { CallbackPayload, CallbackResult } from "./callback";
import { log } from "./logger";
import type { EncodeJob } from "./queue";

export interface SuccessOutcome {
  contentUrl: string;
  duration?: number;
  thumbnailKey?: string;
}

export interface JobFinalizerServices {
  setProgress(
    movieId: string,
    progress: {
      status: "failed" | "completed";
      progress?: number;
      duration?: number;
    },
  ): Promise<void>;
  callback(payload: CallbackPayload): Promise<CallbackResult>;
  deleteOutput(s3Key: string): Promise<void>;
}

export const createJobFinalizer = (services: JobFinalizerServices) => {
  const notifyFailure = async (job: EncodeJob): Promise<void> => {
    await services.setProgress(job.movieId, { status: "failed" });
    await services.callback({
      movieId: job.movieId,
      variantId: "original",
      status: "failed",
      s3Key: job.s3Key,
    });
  };

  const finalizeSuccess = async (
    job: EncodeJob,
    outcome: SuccessOutcome,
  ): Promise<"completed" | "failed"> => {
    await services.setProgress(job.movieId, {
      status: "completed",
      progress: 100,
      duration: outcome.duration,
    });
    const callbackResult = await services.callback({
      movieId: job.movieId,
      variantId: "original",
      status: "success",
      s3Key: job.s3Key,
      contentUrl: outcome.contentUrl,
      duration: outcome.duration,
      thumbnailKey: outcome.thumbnailKey,
    });
    if (callbackResult === "rejected") {
      await services
        .deleteOutput(job.s3Key)
        .catch((error) =>
          log.error(
            `Failed to remove rejected output: movieId=${job.movieId}`,
            error,
          ),
        );
      await notifyFailure(job);
      return "failed";
    }
    log.info(`Job completed successfully: movieId=${job.movieId}`);
    return "completed";
  };

  return { finalizeSuccess, notifyFailure };
};

export type { CallbackPayload, CallbackResult };
