import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sendCallback } from "./callback";
import { PROCESSING_JOB_HEARTBEAT_MS } from "./config";
import { TEMP_DIR } from "./env";
import { markJobFailed, processJob } from "./job-runner";
import { log, withLogContext } from "./logger";
import { callbackFailures } from "./metrics";
import { shutdownOtelMetrics } from "./otel";
import {
  closeRedis,
  type EncodeJob,
  expireProcessingJob,
  refreshProcessingJob,
  requeueProcessingJob,
} from "./queue";
import { createReaper } from "./reaper";
import { createShutdownHandler } from "./shutdown";
import { runWorkerLoop } from "./worker-loop";

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

const workerState = {
  get isShuttingDown() {
    return isShuttingDown;
  },
  set isShuttingDown(value) {
    isShuttingDown = value;
  },
  get activeJob() {
    return activeJob;
  },
  set activeJob(value) {
    activeJob = value;
  },
  get activeJobClaim() {
    return activeJobClaim;
  },
  set activeJobClaim(value) {
    activeJobClaim = value;
  },
  get activeJobCommitted() {
    return activeJobCommitted;
  },
  set activeJobCommitted(value) {
    activeJobCommitted = value;
  },
  get jobRelinquished() {
    return jobRelinquished;
  },
  set jobRelinquished(value) {
    jobRelinquished = value;
  },
  get activeJobAbortController() {
    return activeJobAbortController;
  },
  set activeJobAbortController(value) {
    activeJobAbortController = value;
  },
};
const pollForJobs = () =>
  runWorkerLoop(workerState, {
    shutdownSignal: jobShutdownAbort.signal,
    writeReadiness,
    startLeaseHeartbeat,
    stopLeaseHeartbeat,
    runReaper,
    finalizeCommittedClaim,
    markJobFailed,
    processJob,
  });

const shutdown = createShutdownHandler({
  state: {
    get shuttingDown() {
      return isShuttingDown;
    },
    set shuttingDown(value) {
      isShuttingDown = value;
    },
    get activeJob() {
      return activeJob;
    },
    get activeJobClaim() {
      return activeJobClaim;
    },
    get activeJobCommitted() {
      return activeJobCommitted;
    },
    set jobRelinquished(value) {
      jobRelinquished = value;
    },
    get jobRelinquished() {
      return jobRelinquished;
    },
  },
  pollPromise: () => pollPromise,
  abortJob: () => jobShutdownAbort.abort(),
  stopLeaseHeartbeat,
  clearHeartbeat: () => clearInterval(heartbeatTimer),
  expireClaim: expireProcessingJob,
  requeueClaim: requeueProcessingJob,
  shutdownMetrics: shutdownOtelMetrics,
  closeRedis,
  exit: (code) => process.exit(code),
});

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
