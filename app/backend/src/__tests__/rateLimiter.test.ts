import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis client
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({}),
}));

// Mock hono-rate-limiter to use MemoryStore instead of RedisStore for tests
vi.mock("hono-rate-limiter", async (importOriginal) => {
  const mod = await importOriginal<typeof import("hono-rate-limiter")>();
  return {
    ...mod,
    // Replace RedisStore with MemoryStore for testing purposes
    // This allows us to test the rate limiting logic without a real Redis
    RedisStore: mod.MemoryStore,
  };
});

describe("authRateLimiter", () => {
  let app: Hono;
  // We need to import the module dynamically to ensure mocks are applied
  let authRateLimiter: MiddlewareHandler;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import to trigger TLA with mocked redis and swapped store
    const rateLimiterModule = await import("../lib/rateLimiter");
    authRateLimiter = rateLimiterModule.authRateLimiter;

    app = new Hono();
    app.post("/login", authRateLimiter, (c) => c.json({ success: true }));
  });

  it("should allow requests under the limit", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-forwarded-for": "test-ip-1" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("should include rate limit headers", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-forwarded-for": "test-ip-2" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.has("ratelimit-limit")).toBe(true);
    expect(res.headers.has("ratelimit-remaining")).toBe(true);
  });

  it("should block after exceeding the limit", async () => {
    const testIp = `test-ip-block-${Date.now()}`;

    // Make 5 requests (should all succeed)
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/login", {
        method: "POST",
        headers: { "x-forwarded-for": testIp },
      });
      expect(res.status).toBe(200);
    }

    // 6th request should be blocked
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-forwarded-for": testIp },
    });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Too many login attempts");
  });

  it("should use x-real-ip as fallback for key generation", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-real-ip": "real-ip-test" },
    });
    expect(res.status).toBe(200);
  });

  it("should share bucket for 'unknown' IP when no headers are present", async () => {
    // Make 5 requests (should all succeed)
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/login", {
        method: "POST",
      });
      expect(res.status).toBe(200);
    }

    // 6th request should be blocked
    const res = await app.request("/login", {
      method: "POST",
    });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Too many login attempts");
  });

  it("should fail-open (allow request) if Redis initialization fails", async () => {
    vi.resetModules();
    // Mock failure for this specific test
    vi.doMock("@/lib/redis", () => ({
      getRedisClient: vi
        .fn()
        .mockRejectedValue(new Error("Redis connection failed")),
    }));

    // Re-import to pickup new mock
    const rateLimiterModule = await import("../lib/rateLimiter");
    const authRateLimiterWithFail = rateLimiterModule.authRateLimiter;

    const appWithError = new Hono();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    appWithError.post("/login", authRateLimiterWithFail, (c) =>
      c.json({ success: true }),
    );

    const res = await appWithError.request("/login", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      "Rate limiter initialization failed:",
      expect.any(Error),
    );
    spy.mockRestore();
  });
});
