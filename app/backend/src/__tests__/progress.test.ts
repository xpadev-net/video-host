import type { User } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({ movie: { findUnique: vi.fn() } }));
const redis = vi.hoisted(() => ({
  getEncodeProgress: vi.fn(),
  getQueuePosition: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/redis", () => redis);
vi.mock("@/utils/systemAccountCache", () => ({
  isSystemAccount: vi.fn().mockResolvedValue(false),
}));

import { progressRoute } from "../routes/api/v4/progress";

const person = (id: string): User => ({
  id,
  name: id,
  username: id,
  role: "USER",
  kind: "HUMAN",
  authUserId: `auth-${id}`,
  avatarUrl: null,
  visibility: "PUBLIC",
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const appFor = (actor?: User) => {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if (actor) c.set("user", actor);
    await next();
  });
  app.route("/progress", progressRoute);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  database.movie.findUnique.mockResolvedValue({ authorId: "alice" });
});

describe("GET /progress/:movieId", () => {
  it("requires authentication", async () => {
    const res = await appFor().request("/progress/m1");
    expect(res.status).toBe(401);
    expect(redis.getEncodeProgress).not.toHaveBeenCalled();
  });

  it("404s for unknown movies", async () => {
    database.movie.findUnique.mockResolvedValue(null);
    const res = await appFor(person("alice")).request("/progress/m1");
    expect(res.status).toBe(404);
  });

  it("refuses non-owners", async () => {
    const res = await appFor(person("bob")).request("/progress/m1");
    expect(res.status).toBe(403);
    expect(redis.getEncodeProgress).not.toHaveBeenCalled();
  });

  it("streams progress to the owner and ends on completion", async () => {
    redis.getEncodeProgress.mockResolvedValue({ status: "completed" });
    const res = await appFor(person("alice")).request("/progress/m1");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: progress");
    expect(body).toContain('"status":"completed"');
  });

  it("closes the stream when no progress ever appears", async () => {
    vi.useFakeTimers();
    try {
      redis.getEncodeProgress.mockResolvedValue(null);
      const res = await appFor(person("alice")).request("/progress/m1");
      const text = res.text();
      await vi.advanceTimersByTimeAsync(2000 * 40);
      expect(await text).toContain("event: end");
      // Bounded: stopped polling instead of looping forever
      expect(redis.getEncodeProgress.mock.calls.length).toBeLessThanOrEqual(31);
    } finally {
      vi.useRealTimers();
    }
  });
});
