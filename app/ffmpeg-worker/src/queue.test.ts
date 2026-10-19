import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createClient } from "redis";

process.env.NODE_ENV ??= "test";
process.env.CALLBACK_SECRET ??= "worker-test-secret";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const client = createClient({ url: process.env.REDIS_URL });
client.on("error", () => {});
let queue: typeof import("./queue.js") | null = null;
let redisError: unknown;

before(async () => {
  try {
    await client.connect();
  } catch (error) {
    redisError = error;
    return;
  }
  queue = await import("./queue.js");
});

beforeEach(async () => {
  if (client.isOpen) await client.flushDb();
});

after(async () => {
  if (client.isOpen) await client.quit();
  if (queue) await queue.closeRedis();
});

const job = (movieId: string) => ({
  movieId,
  s3Key: `uploads/${movieId}.mp4`,
  userId: "user-1",
  createdAt: new Date().toISOString(),
});

test("claim and finish atomically move a job through processing", async (context) => {
  const workerQueue = queue;
  if (!workerQueue) {
    context.skip(`Redis unavailable: ${String(redisError)}`);
    return;
  }
  const encodeJob = job("claim-finish");
  await client.lPush(workerQueue.ENCODE_QUEUE_KEY, JSON.stringify(encodeJob));

  const claim = await workerQueue.claimNextEncodeJob();
  assert.ok(claim);
  assert.deepEqual(claim.job, encodeJob);
  assert.equal(await client.lLen(workerQueue.ENCODE_QUEUE_KEY), 0);
  assert.equal(await client.zCard(workerQueue.PROCESSING_QUEUE_KEY), 1);

  await workerQueue.finishProcessingJob(claim.member, claim.job);
  assert.equal(await client.zCard(workerQueue.PROCESSING_QUEUE_KEY), 0);
});

test("shutdown requeue preserves the retry budget and issues a fresh claim", async (context) => {
  const workerQueue = queue;
  if (!workerQueue) {
    context.skip(`Redis unavailable: ${String(redisError)}`);
    return;
  }
  const encodeJob = job("shutdown-requeue");
  await client.lPush(workerQueue.ENCODE_QUEUE_KEY, JSON.stringify(encodeJob));
  const firstClaim = await workerQueue.claimNextEncodeJob();
  assert.ok(firstClaim);

  assert.equal(
    await workerQueue.requeueProcessingJob(firstClaim.member, firstClaim.job),
    true,
  );
  assert.equal(await client.zCard(workerQueue.PROCESSING_QUEUE_KEY), 0);

  const secondClaim = await workerQueue.claimNextEncodeJob();
  assert.ok(secondClaim);
  assert.notEqual(secondClaim.claimId, firstClaim.claimId);
  assert.equal(secondClaim.job.retryCount, undefined);
  await workerQueue.finishProcessingJob(secondClaim.member, secondClaim.job);
});

test("retry processing returns due jobs and records queued progress", async (context) => {
  const workerQueue = queue;
  if (!workerQueue) {
    context.skip(`Redis unavailable: ${String(redisError)}`);
    return;
  }
  const encodeJob = { ...job("retry-due"), retryCount: 1 };
  await client.zAdd(workerQueue.RETRY_QUEUE_KEY, {
    score: Math.floor(Date.now() / 1000) - 1,
    value: JSON.stringify(encodeJob),
  });

  assert.equal(await workerQueue.processRetryQueue(), 1);
  assert.equal(await client.zCard(workerQueue.RETRY_QUEUE_KEY), 0);
  assert.equal(await client.lLen(workerQueue.ENCODE_QUEUE_KEY), 1);
  assert.deepEqual(
    JSON.parse(
      (await client.get(
        `${workerQueue.ENCODE_PROGRESS_PREFIX}${encodeJob.movieId}`,
      )) ?? "null",
    ),
    { status: "queued" },
  );
});

test("malformed queue payloads are dead-lettered", async (context) => {
  const workerQueue = queue;
  if (!workerQueue) {
    context.skip(`Redis unavailable: ${String(redisError)}`);
    return;
  }
  await client.lPush(workerQueue.ENCODE_QUEUE_KEY, "not-json");

  assert.equal(await workerQueue.claimNextEncodeJob(), null);
  assert.equal(await client.lLen(workerQueue.ENCODE_QUEUE_KEY), 0);
  assert.equal(await client.zCard(workerQueue.DEAD_LETTER_QUEUE_KEY), 1);
});
