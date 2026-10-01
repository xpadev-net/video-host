import type { User } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  movie: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/s3", () => ({ s3Client: {} }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue("https://storage.example.test/video.mp4?signature=test"),
}));

import { callbackRoute } from "../routes/api/v4/callback";
import { systemAccountsRoute } from "../routes/api/v4/system-accounts";
import { vodRoute } from "../routes/api/v4/vod";
import { canManageMovie, resolveAuthorId } from "../utils/movieAuth";
import { isSystemAccount } from "../utils/systemAccountCache";

const person = (id: string, role: User["role"] = "USER"): User => ({
  id,
  name: id,
  username: id,
  role,
  kind: "HUMAN",
  authUserId: `auth-${id}`,
  avatarUrl: null,
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const admin = person("administrator", "ADMIN");
const member = person("member");
const humanSso = person("sso-person");
const system: User = {
  ...person("system-author"),
  kind: "SYSTEM",
  authUserId: null,
};

function appFor(actor?: User) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if (actor) c.set("user", actor);
    await next();
  });
  app.route("/api/v4/system-accounts", systemAccountsRoute);
  app.route("/api/v4/callback", callbackRoute);
  app.route("/api/v4/vod", vodRoute);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("explicit HUMAN and SYSTEM authorization", () => {
  it("never classifies an SSO human or missing user as system", async () => {
    database.user.findUnique
      .mockResolvedValueOnce({ kind: "HUMAN" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ kind: "SYSTEM" });
    expect(await isSystemAccount(humanSso.id)).toBe(false);
    expect(await isSystemAccount("missing")).toBe(false);
    expect(await isSystemAccount(system.id)).toBe(true);
    expect(database.user.findUnique).toHaveBeenCalledWith({
      where: { id: humanSso.id },
      select: { kind: true },
    });
  });
  it("allows admin delegation only to an explicit system author", async () => {
    database.user.findUnique
      .mockResolvedValueOnce(humanSso)
      .mockResolvedValueOnce(system);
    await expect(resolveAuthorId(admin, humanSso.id)).rejects.toMatchObject({
      status: 400,
    });
    expect(await resolveAuthorId(admin, system.id)).toBe(system.id);
  });
  it("rejects ordinary users posting for system accounts", async () => {
    await expect(resolveAuthorId(member, system.id)).rejects.toMatchObject({
      status: 401,
    });
    expect(database.user.findUnique).not.toHaveBeenCalled();
    expect(await resolveAuthorId(member)).toBe(member.id);
  });
  it("keeps self-management and limits admin management of other authors", async () => {
    database.user.findUnique
      .mockResolvedValueOnce({ kind: "HUMAN" })
      .mockResolvedValueOnce({ kind: "SYSTEM" });
    expect(await canManageMovie(member, member.id)).toBe(true);
    expect(await canManageMovie(admin, humanSso.id)).toBe(false);
    expect(await canManageMovie(admin, system.id)).toBe(true);
    expect(await canManageMovie(member, system.id)).toBe(false);
  });
  it("lists only explicitly classified SYSTEM accounts", async () => {
    database.user.findMany.mockResolvedValue([system]);
    expect(
      (await appFor(admin).request("/api/v4/system-accounts")).status,
    ).toBe(200);
    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: "SYSTEM" } }),
    );
  });
  it("creates SYSTEM accounts without an authentication identity", async () => {
    database.user.findUnique.mockResolvedValue(null);
    database.user.create.mockResolvedValue(system);
    const response = await appFor(admin).request("/api/v4/system-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "System", username: "system" }),
    });
    expect(response.status).toBe(200);
    expect(database.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "System", username: "system", kind: "SYSTEM" },
      }),
    );
  });
  it.each([
    humanSso,
    { ...system, authUserId: "unexpected-auth-mapping" },
  ])("rejects system deletion for human/mapped identities", async (target) => {
    database.user.findUnique.mockResolvedValue(target);
    expect(
      (
        await appFor(admin).request(`/api/v4/system-accounts/${target.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(400);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    member,
  ])("rejects non-admin system administration", async (actor) => {
    expect(
      (await appFor(actor).request("/api/v4/system-accounts")).status,
    ).toBe(401);
    expect(database.user.findMany).not.toHaveBeenCalled();
  });
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
  it("rejects cookie/admin context for VOD mapping without internal secret", async () => {
    expect(
      (
        await appFor(admin).request("/api/v4/vod/mapping/movie.mp4", {
          headers: { Cookie: "better-auth.session_token=browser-session" },
        })
      ).status,
    ).toBe(401);
  });
  it("accepts the independent VOD secret", async () => {
    expect(
      (
        await appFor().request("/api/v4/vod/mapping/movie.mp4", {
          headers: { "X-Vod-Internal-Secret": "test-vod-internal-secret" },
        })
      ).status,
    ).toBe(200);
  });
});
