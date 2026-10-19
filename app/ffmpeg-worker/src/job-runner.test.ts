import assert from "node:assert/strict";
import { test } from "node:test";
import type { JobContext } from "./job-runner";

process.env.NODE_ENV ??= "test";
process.env.CALLBACK_SECRET ??= "worker-test-secret";

const createContext = (overrides: Partial<JobContext> = {}): JobContext => ({
  shutdownSignal: new AbortController().signal,
  activeJobClaim: null,
  activeJobCommitted: false,
  jobRelinquished: false,
  getAbortController: () => null,
  setAbortController: () => {},
  ...overrides,
});

test("processJob does not start work after the claim was relinquished", async () => {
  const { processJob } = await import("./job-runner.js");
  const job = {
    movieId: "already-relinquished",
    s3Key: "uploads/already-relinquished.mp4",
    userId: "user-1",
    createdAt: new Date().toISOString(),
  };

  assert.equal(
    await processJob(job, createContext({ jobRelinquished: true })),
    "relinquished",
  );
});
