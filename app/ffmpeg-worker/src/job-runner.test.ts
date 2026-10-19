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

test("finalizeSuccess records and notifies a completed job", async () => {
  const { createJobFinalizer } = await import("./job-finalizer.js");
  const job = {
    movieId: "finalize-success",
    s3Key: "uploads/finalize-success.mp4",
    userId: "user-1",
    createdAt: new Date().toISOString(),
  };
  const statuses: string[] = [];
  const callbacks: string[] = [];
  const finalizer = createJobFinalizer({
    setProgress: async (_movieId, progress) => {
      statuses.push(progress.status);
    },
    callback: async (payload) => {
      callbacks.push(payload.status);
      return "accepted";
    },
    deleteOutput: async () => {},
  });
  const result = await finalizer.finalizeSuccess(job, {
    contentUrl: "https://cdn.example/video/master.m3u8",
    duration: 12,
  });

  assert.equal(result, "completed");
  assert.deepEqual(statuses, ["completed"]);
  assert.deepEqual(callbacks, ["success"]);
});

test("finalizeSuccess removes rejected output and reports failure", async () => {
  const { createJobFinalizer } = await import("./job-finalizer.js");
  const job = {
    movieId: "finalize-rejected",
    s3Key: "uploads/finalize-rejected.mp4",
    userId: "user-1",
    createdAt: new Date().toISOString(),
  };
  const statuses: string[] = [];
  const callbacks: string[] = [];
  const deleted: string[] = [];
  const finalizer = createJobFinalizer({
    setProgress: async (_movieId, progress) => {
      statuses.push(progress.status);
    },
    callback: async (payload) => {
      callbacks.push(payload.status);
      return payload.status === "success" ? "rejected" : "accepted";
    },
    deleteOutput: async (key) => {
      deleted.push(key);
    },
  });
  const result = await finalizer.finalizeSuccess(job, {
    contentUrl: "https://cdn.example/video/master.m3u8",
  });

  assert.equal(result, "failed");
  assert.deepEqual(statuses, ["completed", "failed"]);
  assert.deepEqual(callbacks, ["success", "failed"]);
  assert.deepEqual(deleted, [job.s3Key]);
});
