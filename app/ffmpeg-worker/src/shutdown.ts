import { log } from "./logger";
import type { EncodeJob } from "./queue";

const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000;

// After aborting the in-flight job, give its own handling a bounded window to
// hand it back to the queue.
const SHUTDOWN_SETTLE_TIMEOUT_MS = 15_000;

export interface ShutdownState {
  shuttingDown: boolean;
  activeJob: EncodeJob | null;
  activeJobClaim: string | null;
  activeJobCommitted: boolean;
  jobRelinquished: boolean;
}

export interface ShutdownDependencies {
  state: ShutdownState;
  pollPromise: () => Promise<void>;
  abortJob(): void;
  stopLeaseHeartbeat(): void;
  clearHeartbeat(): void;
  expireClaim(member: string): Promise<void>;
  requeueClaim(member: string, job: EncodeJob): Promise<boolean>;
  shutdownMetrics(): Promise<void>;
  closeRedis(): Promise<void>;
  exit(code: number): never;
}

export const createShutdownHandler =
  (deps: ShutdownDependencies) => async (): Promise<void> => {
    const { state } = deps;
    if (state.shuttingDown) return;
    log.info("Shutting down...");
    state.shuttingDown = true;
    const finalizing = state.activeJob !== null && state.activeJobCommitted;
    if (!finalizing) {
      if (state.activeJob)
        console.warn(
          `Aborting in-flight job on shutdown: movieId=${state.activeJob.movieId}`,
        );
      deps.abortJob();
    }
    deps.clearHeartbeat();
    await Promise.race([
      deps.pollPromise(),
      new Promise((resolve) =>
        setTimeout(
          resolve,
          finalizing ? SHUTDOWN_DRAIN_TIMEOUT_MS : SHUTDOWN_SETTLE_TIMEOUT_MS,
        ),
      ),
    ]);
    if (state.activeJob && finalizing) {
      deps.abortJob();
      await Promise.race([
        deps.pollPromise(),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
    if (state.activeJob) {
      log.warn(
        `Relinquishing in-flight job on shutdown: movieId=${state.activeJob.movieId}`,
      );
      state.jobRelinquished = true;
      deps.stopLeaseHeartbeat();
      if (state.activeJobClaim) {
        try {
          if (state.activeJobCommitted)
            await deps.expireClaim(state.activeJobClaim);
          else await deps.requeueClaim(state.activeJobClaim, state.activeJob);
        } catch (err) {
          log.error(
            `Failed to hand off processing claim: movieId=${state.activeJob.movieId}`,
            err,
          );
        }
      }
    }
    await deps
      .shutdownMetrics()
      .catch((err) => log.error("OTel metrics shutdown failed:", err));
    await deps.closeRedis();
    deps.exit(0);
  };
