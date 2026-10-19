import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  authRateLimit: { findMany: vi.fn(), deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
const redis = vi.hoisted(() => ({ ping: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(async () => redis),
}));

import { cleanupAuthRateLimits } from "../lib/auth-maintenance";
import {
  decodeJwtPayload,
  normalizeIssuer,
  oidcIssuerMatches,
  safeAvatarUrl,
} from "../lib/auth-policy";
import { provisionAuthProfile } from "../lib/auth-profile";
import { filterSelf, filterUser } from "../lib/filter";
import { registerMiddleware } from "../middleware";
import { registerHealthzRoute } from "../routes/healthz";

const identity = { id: "auth-1", name: "Ann", email: "ann@example.com" };

beforeEach(() => vi.clearAllMocks());

describe("OIDC helpers", () => {
  it("treats a trailing slash on the issuer as insignificant", () => {
    expect(normalizeIssuer("https://idp.example/realm///")).toBe(
      "https://idp.example/realm",
    );
    expect(
      oidcIssuerMatches("https://idp.example/", "https://idp.example"),
    ).toBe(true);
    expect(
      oidcIssuerMatches("https://idp.example", "https://idp.example/"),
    ).toBe(true);
    expect(
      oidcIssuerMatches("https://evil.example", "https://idp.example"),
    ).toBe(false);
    expect(oidcIssuerMatches(undefined, "https://idp.example")).toBe(false);
  });

  it("returns null instead of throwing for malformed ID tokens", () => {
    expect(decodeJwtPayload("no-dots")).toBeNull();
    expect(decodeJwtPayload("a.%%%.c")).toBeNull();
    expect(
      decodeJwtPayload(`a.${Buffer.from("[1]").toString("base64url")}.c`),
    ).toBeNull();
    const payload = Buffer.from('{"sub":"x"}').toString("base64url");
    expect(decodeJwtPayload(`a.${payload}.c`)).toEqual({ sub: "x" });
  });

  it("accepts only http(s) avatar URLs that fit the column", () => {
    expect(safeAvatarUrl("https://cdn.example/a.png")).toBe(
      "https://cdn.example/a.png",
    );
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeAvatarUrl(`https://x.example/${"a".repeat(200)}`)).toBeNull();
    expect(safeAvatarUrl(null)).toBeNull();
  });
});

describe("provisionAuthProfile", () => {
  it("only reads for an existing identity (no per-request write)", async () => {
    database.user.findUnique.mockResolvedValue({ id: "u1" });
    expect(await provisionAuthProfile(identity)).toEqual({ id: "u1" });
    expect(database.user.create).not.toHaveBeenCalled();
    expect(database.user.upsert).not.toHaveBeenCalled();
  });

  it("creates the profile on first sight, dropping unsafe avatars", async () => {
    database.user.findUnique.mockResolvedValue(null);
    database.user.create.mockResolvedValue({ id: "u2" });
    await provisionAuthProfile({ ...identity, image: "javascript:x" });
    expect(database.user.create.mock.calls[0][0].data).toMatchObject({
      authUserId: "auth-1",
      avatarUrl: null,
      kind: "HUMAN",
    });
  });

  it("recovers when a concurrent request created the row first", async () => {
    database.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u3" });
    database.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    expect(await provisionAuthProfile(identity)).toEqual({ id: "u3" });
  });
});

describe("rate limit cleanup", () => {
  it("deletes expired rows in bounded batches", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    database.authRateLimit.findMany
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ id: "last" }]);
    database.authRateLimit.deleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 1 });
    const now = 10 * 3600 * 1000;
    expect(await cleanupAuthRateLimits(now)).toBe(1001);
    expect(database.authRateLimit.findMany).toHaveBeenCalledWith({
      where: { lastRequest: { lt: BigInt(now - 3600 * 1000) } },
      select: { id: true },
      take: 1000,
    });
    expect(database.authRateLimit.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("does nothing when nothing expired", async () => {
    database.authRateLimit.findMany.mockResolvedValue([]);
    expect(await cleanupAuthRateLimits()).toBe(0);
    expect(database.authRateLimit.deleteMany).not.toHaveBeenCalled();
  });
});

describe("public user DTO", () => {
  const user = {
    id: "u",
    name: "n",
    username: "un",
    role: "ADMIN" as const,
    avatarUrl: null,
  };
  it("does not leak roles except to the user themself", () => {
    expect(filterUser(user)).not.toHaveProperty("role");
    expect(filterSelf(user)).toHaveProperty("role", "ADMIN");
  });
});

describe("readiness, body limit and security headers", () => {
  const app = new Hono() as Parameters<typeof registerMiddleware>[0];
  registerMiddleware(app);
  registerHealthzRoute(app);
  app.post("/echo", async (c) => c.json(await c.req.json()));

  it("does not hang when Redis stalls", async () => {
    database.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    redis.ping.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ database: true, redis: false });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reports 503 only when the database is down", async () => {
    database.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    redis.ping.mockRejectedValue(new Error("down"));
    const degraded = await app.request("/readyz");
    expect(degraded.status).toBe(200);
    expect(await degraded.json()).toMatchObject({
      database: true,
      redis: false,
    });

    database.$queryRaw.mockRejectedValue(new Error("down"));
    expect((await app.request("/readyz")).status).toBe(503);
  });

  it("rejects oversized bodies and sets security headers", async () => {
    const res = await app.request("/healthz");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const big = await app.request("/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(2 * 1024 * 1024),
      },
      body: JSON.stringify({ pad: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(big.status).toBe(413);
  });
});
