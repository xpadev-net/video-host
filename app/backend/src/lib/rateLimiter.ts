import type { Context, MiddlewareHandler } from "hono";
import { RedisStore, rateLimiter } from "hono-rate-limiter";
import { getRedisClient } from "@/lib/redis";

let middlewarePromise: Promise<MiddlewareHandler> | null = null;

async function getMiddleware(): Promise<MiddlewareHandler> {
  if (middlewarePromise) return middlewarePromise;

  middlewarePromise = getRedisClient().then((client) => {
    return rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 5, // Maximum 5 requests per window
      standardHeaders: "draft-6", // Return rate limit info in headers
      store: new RedisStore({
        // @ts-expect-error - node-redis client type compatibility
        client: client,
        prefix: "rate-limit:",
      }),
      keyGenerator: (c: Context): string => {
        // Use X-Forwarded-For or X-Real-IP for proxy support, fallback to "unknown"
        const forwarded = c.req.header("x-forwarded-for");
        const realIp = c.req.header("x-real-ip");
        return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
      },
      handler: (c: Context) => {
        return c.json(
          {
            success: false,
            error: "Too many login attempts. Please try again later.",
          },
          429,
        );
      },
    });
  });

  return middlewarePromise;
}

/**
 * Rate limiter for authentication endpoints.
 * Limits to 5 requests per 15 minutes per IP address to prevent brute-force attacks.
 * Uses Redis for storage to support distributed deployments.
 * Fail-safe: allows requests if Redis is unreachable.
 */
export const authRateLimiter: MiddlewareHandler = async (c, next) => {
  try {
    const handler = await getMiddleware();
    return handler(c, next);
  } catch (error) {
    console.error("Rate limiter initialization failed:", error);
    // Fail-safe: allow request but log error
    return next();
  }
};
