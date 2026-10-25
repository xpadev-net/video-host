import assert from "node:assert/strict";
import { test } from "node:test";
import type { EncodeJob } from "./queue";

test("shutdown requeues an uncommitted active job before closing services", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const job: EncodeJob = {
    movieId: "shutdown-test",
    s3Key: "uploads/shutdown-test.mp4",
    userId: "user-1",
    createdAt: new Date().toISOString(),
  };
  const state = {
    shuttingDown: false,
    activeJob: job,
    activeJobClaim: "claim-1",
    activeJobCommitted: false,
    jobRelinquished: false,
  };
  let requeued = false;
  let metricsClosed = false;
  let redisClosed = false;
  const { createShutdownHandler } = await import("./shutdown.js");
  const shutdown = createShutdownHandler({
    state,
    pollPromise: async () => {},
    abortJob: () => {},
    stopLeaseHeartbeat: () => {},
    clearHeartbeat: () => {},
    expireClaim: async () => {},
    requeueClaim: async (member, claimedJob) => {
      assert.equal(member, "claim-1");
      assert.equal(claimedJob, job);
      requeued = true;
      return true;
    },
    shutdownMetrics: async () => {
      metricsClosed = true;
    },
    closeRedis: async () => {
      redisClosed = true;
    },
    exit: (code) => {
      assert.equal(code, 0);
      throw new Error("exit-called");
    },
  });

  await assert.rejects(shutdown(), /exit-called/);
  t.mock.timers.runAll();
  assert.equal(state.shuttingDown, true);
  assert.equal(state.jobRelinquished, true);
  assert.equal(requeued, true);
  assert.equal(metricsClosed, true);
  assert.equal(redisClosed, true);
});
