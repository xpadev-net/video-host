import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/@types/account";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  movie: { findUnique: vi.fn() },
  movieVariant: { findFirst: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/s3", () => ({ s3Client: {} }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue("https://storage.example.test/video.mp4?signature=test"),
}));

import { createVodToken } from "../lib/vod-token";
import { accountsRoute } from "../routes/api/v4/accounts";
import { callbackRoute } from "../routes/api/v4/callback";
import { vodRoute } from "../routes/api/v4/vod";
import { canManageOwned, resolveAuthorId } from "../utils/movieAuth";

const person = (id: string, role: User["role"] = "USER"): User => ({
  id,
  name: id,
  username: id,
  role,

  accountId: `auth-${id}`,
  avatarUrl: null,
  visibility: "PUBLIC",
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const admin = person("administrator", "ADMIN");
const member = person("member");
const humanSso = person("sso-person");

function appFor(actor?: User) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if (actor) {
      c.set("user", actor);
      c.set("account", {
        id: actor.accountId,
        name: actor.name,
        role: actor.role,
      });
    }
    await next();
  });
  app.route("/api/v4/accounts", accountsRoute);
  app.route("/api/v4/callback", callbackRoute);
  app.route("/api/v4/vod", vodRoute);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("common account authorization", () => {
  it("allows administrators to manage every profile", async () => {
    database.user.findUnique.mockResolvedValue(humanSso);
    expect(await resolveAuthorId(admin, humanSso.id)).toBe(humanSso.id);
    expect(await canManageOwned(admin, humanSso.id)).toBe(true);
    expect(await canManageOwned(member, humanSso.id)).toBe(false);
  });
  it("rejects ordinary users posting for another profile", async () => {
    await expect(resolveAuthorId(member, humanSso.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(await resolveAuthorId(member)).toBe(member.id);
  });
  it.each([undefined, member])(
    "requires administrator permissions",
    async (actor) => {
      expect((await appFor(actor).request("/api/v4/accounts")).status).toBe(
        actor ? 403 : 401,
      );
    },
  );
});

describe("machine authentication remains separate", () => {
  it("rejects a browser cookie and even an admin context for FFmpeg callbacks", async () => {
    const response = await appFor(admin).request("/api/v4/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "better-auth.session_token=browser-session",
      },
      body: JSON.stringify({ movieId: "movie", status: "success" }),
    });
    expect(response.status).toBe(401);
    expect(database.movie.findUnique).not.toHaveBeenCalled();
  });
  it("accepts the independent FFmpeg secret then applies ordinary validation", async () => {
    database.movie.findUnique.mockResolvedValue(null);
    const response = await appFor().request("/api/v4/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-callback-secret",
      },
      body: JSON.stringify({ movieId: "missing", status: "success" }),
    });
    expect(response.status).toBe(400);
    expect(database.movie.findUnique).toHaveBeenCalled();
  });
  it("rejects invalid callback secrets before reading movie state", async () => {
    const response = await appFor().request("/api/v4/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({
        movieId: "m1",
        variantId: "original",
        s3Key: "uploads/alice/video.mp4",
        status: "failed",
      }),
    });
    expect(response.status).toBe(401);
    expect(database.movie.findUnique).not.toHaveBeenCalled();
  });
  it("does not transition a READY variant to FAILED", async () => {
    database.movie.findUnique.mockResolvedValue({ id: "m1" });
    database.movieVariant.findFirst.mockResolvedValue({ id: "v1" });
    database.movieVariant.updateMany.mockResolvedValue({ count: 0 });
    database.$transaction.mockImplementation((operation) =>
      operation(database),
    );

    const response = await appFor().request("/api/v4/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-callback-secret",
      },
      body: JSON.stringify({
        movieId: "m1",
        variantId: "original",
        s3Key: "uploads/alice/video.mp4",
        status: "failed",
      }),
    });
    expect(response.status).toBe(409);
    expect(database.movieVariant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PROCESSING" }),
        data: { status: "FAILED" },
      }),
    );
  });
  it("rejects cookie/admin context for VOD mapping without internal secret", async () => {
    expect(
      (
        await appFor(admin).request("/api/v4/vod/mapping/movie.mp4", {
          headers: { Cookie: "better-auth.session_token=browser-session" },
        })
      ).status,
    ).toBe(401);
  });
  it("accepts the independent VOD secret with a valid playback token", async () => {
    const key = "uploads/u1/movie.mp4";
    expect(
      (
        await appFor().request(
          `/api/v4/vod/mapping/${createVodToken(key)}/${key}`,
          { headers: { "X-Vod-Internal-Secret": "test-vod-internal-secret" } },
        )
      ).status,
    ).toBe(200);
  });
  it("rejects VOD mapping without a valid playback token", async () => {
    const headers = { "X-Vod-Internal-Secret": "test-vod-internal-secret" };
    const key = "uploads/u1/movie.mp4";
    const other = createVodToken("uploads/u2/other.mp4");
    const expired = createVodToken(key, Date.now() - 7 * 3600 * 1000);
    for (const path of [
      `/api/v4/vod/mapping/${key}`, // guessed key, no token
      `/api/v4/vod/mapping/bogus/${key}`,
      `/api/v4/vod/mapping/${other}/${key}`, // token for another key
      `/api/v4/vod/mapping/${expired}/${key}`,
    ]) {
      expect((await appFor().request(path, { headers })).status).toBe(401);
    }
  });
});
