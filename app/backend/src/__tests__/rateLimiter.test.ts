import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { authRateLimiter } from "../lib/rateLimiter";

describe("authRateLimiter", () => {
  let app: Hono;

  beforeEach(() => {
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
    // draft-6 headers
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

  it("should return 429 with proper error message", async () => {
    const testIp = `test-ip-error-${Date.now()}`;

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await app.request("/login", {
        method: "POST",
        headers: { "x-forwarded-for": testIp },
      });
    }

    // Check error response
    const res = await app.request("/login", {
      method: "POST",
      headers: { "x-forwarded-for": testIp },
    });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Too many login attempts. Please try again later.");
  });
});
