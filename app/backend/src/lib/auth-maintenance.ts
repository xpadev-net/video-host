import { prisma } from "@/lib/prisma";

// Better Auth's database rate limiter inserts one row per IP x path and never
// removes them. Its windows are at most a minute, so anything older than an
// hour can no longer influence a decision.
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export const cleanupAuthRateLimits = async (
  now = Date.now(),
): Promise<number> => {
  const { count } = await prisma.authRateLimit.deleteMany({
    where: { lastRequest: { lt: BigInt(now - RATE_LIMIT_RETENTION_MS) } },
  });
  return count;
};

export const startAuthRateLimitCleanup = (): NodeJS.Timeout => {
  const run = () =>
    cleanupAuthRateLimits().catch((error) =>
      console.error("Failed to clean up auth rate limits:", error),
    );
  void run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
};
