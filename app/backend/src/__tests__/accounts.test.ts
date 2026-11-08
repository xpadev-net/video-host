import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/@types/account";
import type { Env } from "@/@types/hono";

const database = vi.hoisted(() => ({
  authUser: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  user: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));

import { accountsRoute } from "@/routes/api/v4/accounts";
import { profilesRoute } from "@/routes/api/v4/users/profiles";

function app(role: "ADMIN" | "USER" = "USER", withProfile = true) {
  const instance = new Hono<Env>();
  instance.use("*", async (c, next) => {
    c.set("authUserId", "own-account");
    c.set("account", { id: "own-account", name: "Account", role });
    if (withProfile)
      c.set("user", {
        id: "own-profile",
        accountId: "own-account",
        role,
      } as User);
    await next();
  });
  instance.route("/accounts", accountsRoute);
  instance.route("/profiles", profilesRoute);
  return instance;
}
const post = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});
beforeEach(() => {
  vi.clearAllMocks();
  database.$transaction.mockImplementation((fn) => fn(database));
});
describe("accounts and profiles", () => {
  it("returns account identity without a profile or administrator role", async () => {
    const response = await app("USER", false).request("/accounts/me");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      id: "own-account",
      name: "Account",
      role: "USER",
    });
  });
  it("lists common accounts with their profiles without exposing credentials", async () => {
    database.authUser.findMany.mockResolvedValue([
      {
        id: "account",
        name: "Account",
        profiles: [{ id: "profile", username: "profile" }],
      },
    ]);
    const response = await app("ADMIN").request("/accounts");
    expect(response.status).toBe(200);
    expect(database.authUser.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      name: true,
      role: true,
      createdAt: true,
      profiles: { select: { id: true, name: true, username: true } },
    });
  });
  it("creates an account and its first profile together", async () => {
    database.authUser.create.mockResolvedValue({
      id: "account",
      profiles: [{ id: "profile" }],
    });
    expect(
      (
        await app("ADMIN").request(
          "/accounts",
          post({ name: "Shared", username: "shared" }),
        )
      ).status,
    ).toBe(200);
    expect(database.authUser.create.mock.calls[0][0].data).toMatchObject({
      name: "Shared",
      profiles: { create: { name: "Shared", username: "shared" } },
    });
  });
  it("denies access to another account's profiles for ordinary accounts", async () => {
    expect((await app().request("/profiles?accountId=other")).status).toBe(403);
    expect(
      (
        await app("USER", false).request(
          "/profiles",
          post({ name: "Profile", username: "profile", accountId: "other" }),
        )
      ).status,
    ).toBe(403);
    expect(database.user.create).not.toHaveBeenCalled();
  });
  it("creates every profile with the same direct account relation", async () => {
    database.user.count.mockResolvedValue(0);
    database.user.create.mockResolvedValue({
      id: "new",
      name: "Profile",
      username: "profile",
      avatarUrl: null,
    });
    expect(
      (
        await app("USER", false).request(
          "/profiles",
          post({ name: "Profile", username: "profile" }),
        )
      ).status,
    ).toBe(200);
    expect(database.user.create).toHaveBeenCalledWith({
      data: { name: "Profile", username: "profile", accountId: "own-account" },
    });
  });
  it("prevents deleting the authenticated account", async () => {
    expect(
      (
        await app("ADMIN").request("/accounts/own-account", {
          method: "DELETE",
        })
      ).status,
    ).toBe(400);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
