import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

/**
 * Rate limiter for authentication endpoints.
 * Limits to 5 requests per 15 minutes per IP address to prevent brute-force attacks.
 */
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Maximum 5 requests per window
  standardHeaders: "draft-6", // Return rate limit info in headers
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
