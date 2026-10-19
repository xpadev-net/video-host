import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

// Better Auth's database rate limiter inserts one row per IP x path and never
// removes them. Its windows are at most a minute, so anything older than an
// hour can no longer influence a decision.
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
// Delete in small batches so a large backlog never holds locks that stall
// concurrent authentication writes.
const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;
const CLEANUP_LOCK_KEY = "video:auth:rate-limit-cleanup";

export const cleanupAuthRateLimits = async (
  now = Date.now(),
): Promise<number> => {
  const cutoff = BigInt(now - RATE_LIMIT_RETENTION_MS);
  let deleted = 0;
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
    const expired = await prisma.authRateLimit.findMany({
      where: { lastRequest: { lt: cutoff } },
      select: { id: true },
      take: CLEANUP_BATCH_SIZE,
    });
    if (expired.length === 0) break;
    const { count } = await prisma.authRateLimit.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
    deleted += count;
    if (expired.length < CLEANUP_BATCH_SIZE) break;
  }
  return deleted;
};

// Only one replica per interval does the work.
const acquireCleanupLock = async (): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    const result = await client.set(CLEANUP_LOCK_KEY, "1", {
      NX: true,
      EX: Math.floor(CLEANUP_INTERVAL_MS / 1000) - 60,
    });
    return result === "OK";
  } catch {
    // Redis down: running on every replica is still safe, just redundant.
    return true;
  }
};

export const startAuthRateLimitCleanup = (): NodeJS.Timeout => {
  const run = async () => {
    try {
      if (await acquireCleanupLock()) await cleanupAuthRateLimits();
    } catch (error) {
      console.error("Failed to clean up auth rate limits:", error);
    }
  };
  void run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
};
