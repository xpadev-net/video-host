import type { User } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  authProfile: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  movie: { findUnique: vi.fn() },
  accessInvitation: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  movieViewer: { upsert: vi.fn() },
  profileViewer: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/utils/systemAccountCache", () => ({
  isSystemAccount: vi.fn().mockResolvedValue(false),
}));

import { invitationsRoute } from "../routes/api/v4/invitations";
import { usersRoute } from "../routes/api/v4/users";

const person = (id: string, role: User["role"] = "USER"): User => ({
  id,
  name: id,
  username: id,
  role,
  kind: "HUMAN",
  authUserId: role === "ADMIN" ? `auth-${id}` : null,
  avatarUrl: null,
  visibility: "PUBLIC",
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const inviter = person("inviter");
const inviteeAccountId = "auth-invitee";

function appFor(actor?: User, authUserId?: string) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if (actor) c.set("user", actor);
    if (authUserId) c.set("authUserId", authUserId);
    await next();
  });
  app.route("/invitations", invitationsRoute);
  app.route("/users", usersRoute);
  return app;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  database.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") return fn(database);
    return Promise.all(fn as unknown[]);
  });
  database.user.findUnique.mockResolvedValue(inviter);
  database.authProfile.findMany.mockResolvedValue([]);
});

describe("invitation creation", () => {
  it("rejects sharing a movie the caller does not own", async () => {
    database.user.findUnique.mockResolvedValue({
      ...inviter,
      authUserId: inviteeAccountId,
    });
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      title: "Movie",
      authorId: "someone-else",
      visibility: "LIMITED",
    });

    const res = await appFor(inviter, "auth-inviter").request(
      "/invitations",
      json({
        targetType: "MOVIE",
        targetId: "m1",
        inviteeUserId: "someone",
      }),
    );
    expect(res.status).toBe(403);
    expect(database.accessInvitation.create).not.toHaveBeenCalled();
  });

  it("rejects inviting your own account", async () => {
    database.user.findUnique.mockResolvedValue({
      ...inviter,
      authUserId: "auth-inviter",
    });
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      title: "Movie",
      authorId: inviter.id,
      visibility: "LIMITED",
    });

    const res = await appFor(inviter, "auth-inviter").request(
      "/invitations",
      json({
        targetType: "MOVIE",
        targetId: "m1",
        inviteeUserId: inviter.id,
      }),
    );
    expect(res.status).toBe(400);
    expect(database.accessInvitation.create).not.toHaveBeenCalled();
  });

  it("creates an invitation for a movie the caller owns", async () => {
    database.user.findUnique.mockResolvedValue({
      ...inviter,
      authUserId: inviteeAccountId,
    });
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      title: "Movie",
      authorId: inviter.id,
      visibility: "PUBLIC",
    });
    database.accessInvitation.findFirst.mockResolvedValue(null);
    database.accessInvitation.create.mockResolvedValue({
      id: "i1",
      inviterId: inviter.id,
      inviteeAuthUserId: inviteeAccountId,
      targetType: "MOVIE",
      targetId: "m1",
      status: "PENDING",
      grantedProfileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await appFor(inviter, "auth-inviter").request(
      "/invitations",
      json({
        targetType: "MOVIE",
        targetId: "m1",
        inviteeUserId: "someone",
      }),
    );
    expect(res.status).toBe(200);
    expect(database.accessInvitation.create).toHaveBeenCalledWith({
      data: {
        inviterId: inviter.id,
        inviteeAuthUserId: inviteeAccountId,
        targetType: "MOVIE",
        targetId: "m1",
      },
    });
  });
});

describe("invitation acceptance", () => {
  it("grants a movie viewer and marks the invitation accepted", async () => {
    database.accessInvitation.findUnique.mockResolvedValue({
      id: "i1",
      inviterId: "other-profile",
      inviteeAuthUserId: "auth-invitee",
      targetType: "MOVIE",
      targetId: "m1",
      status: "PENDING",
      grantedProfileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      visibility: "LIMITED",
    });

    const actor = person("chosen-profile");
    database.user.findUnique.mockResolvedValue(actor);

    const res = await appFor(actor, "auth-invitee").request(
      "/invitations/i1/accept",
      json({ profileId: "chosen-profile" }),
    );
    expect(res.status).toBe(200);
    expect(database.movieViewer.upsert).toHaveBeenCalledWith({
      where: {
        movieId_userId: { movieId: "m1", userId: "chosen-profile" },
      },
      create: { movieId: "m1", userId: "chosen-profile" },
      update: {},
    });
    expect(database.accessInvitation.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { status: "ACCEPTED", grantedProfileId: "chosen-profile" },
    });
  });
});

describe("user search", () => {
  it("filters the user list to PUBLIC profiles for non-admins", async () => {
    database.user.count.mockResolvedValue(0);
    database.user.findMany.mockResolvedValue([]);
    const app = appFor(inviter, "auth-inviter");
    await app.request("/users?query=al");
    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { username: { contains: "al" } },
                { name: { contains: "al" } },
              ],
            },
            { OR: [{ visibility: "PUBLIC" }, { id: inviter.id }] },
          ],
        },
      }),
    );
  });
});
