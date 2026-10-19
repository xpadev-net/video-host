import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkerEnv } from "./config";

test("worker environment applies documented defaults", () => {
  const env = parseWorkerEnv(
    { NODE_ENV: "development", FFMPEG_THREADS: "" },
    2,
  );

  assert.equal(env.REDIS_URL, "redis://localhost:6379");
  assert.equal(env.CALLBACK_SECRET, "dev-callback-secret");
  assert.equal(env.POLL_INTERVAL_MS, 5000);
  assert.equal(env.MIN_DISK_SPACE_GB, 1);
  assert.equal(env.JOB_TIMEOUT_SECONDS, 7200);
  assert.equal(env.FFMPEG_THREADS, 2);
  assert.equal(env.LOG_LEVEL, "info");
});

test("worker environment parses numeric and boolean settings", () => {
  const env = parseWorkerEnv(
    {
      NODE_ENV: "production",
      CALLBACK_SECRET: "secret",
      POLL_INTERVAL_MS: "2500",
      MIN_DISK_SPACE_GB: "0",
      JOB_TIMEOUT_SECONDS: "120",
      FFMPEG_THREADS: "4",
      S3_FORCE_PATH_STYLE: "yes",
    },
    2,
  );

  assert.equal(env.POLL_INTERVAL_MS, 2500);
  assert.equal(env.MIN_DISK_SPACE_GB, 0);
  assert.equal(env.JOB_TIMEOUT_SECONDS, 120);
  assert.equal(env.FFMPEG_THREADS, 4);
  assert.equal(env.S3_FORCE_PATH_STYLE, true);
});

test("invalid numeric values fail with the offending environment name", () => {
  assert.throws(
    () =>
      parseWorkerEnv(
        {
          NODE_ENV: "production",
          CALLBACK_SECRET: "secret",
          JOB_TIMEOUT_SECONDS: "not-a-number",
        },
        2,
      ),
    /JOB_TIMEOUT_SECONDS/,
  );
  assert.throws(
    () =>
      parseWorkerEnv(
        {
          NODE_ENV: "production",
          CALLBACK_SECRET: "secret",
          FFMPEG_THREADS: "0",
        },
        2,
      ),
    /FFMPEG_THREADS/,
  );
});

test("production requires a callback secret and flags reject unknown values", () => {
  assert.throws(
    () => parseWorkerEnv({ NODE_ENV: "production" }, 2),
    /CALLBACK_SECRET/,
  );
  assert.throws(
    () =>
      parseWorkerEnv(
        {
          NODE_ENV: "production",
          CALLBACK_SECRET: "secret",
          S3_FORCE_PATH_STYLE: "sometimes",
        },
        2,
      ),
    /S3_FORCE_PATH_STYLE/,
  );
  assert.throws(
    () =>
      parseWorkerEnv(
        {
          NODE_ENV: "production",
          CALLBACK_SECRET: "secret",
          LOG_LEVEL: "verbose",
        },
        2,
      ),
    /LOG_LEVEL/,
  );
});
