import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { trimTrailingSlash } from "hono/trailing-slash";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/@types/hono";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProfile: vi.fn(),
  findAccount: vi.fn(),
}));
vi.mock("@/env", () => ({
  AUTH_TRUSTED_ORIGINS: ["https://video.example.com"],
  PUBLIC_ENDPOINTS: ["/api/v4/public"],
  OIDC_DISPLAY_NAME: "SSO",
  OIDC_ENABLED: false,
  PASSWORD_AUTH_ENABLED: true,
  SIGNUP_CODE: undefined,
  SIGNUP_ENABLED: false,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
  accountLinkingEnabled: false,
  ssoProviderId: null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findProfile },
    authUser: { findUnique: mocks.findAccount },
  },
}));

import { handleAuth } from "@/middleware/auth";
import { authRoute } from "@/routes/api/v4/auth";

const profile = {
  id: "domain-id",
  username: "domain_user",
  name: "Default profile",
  accountId: "auth-id",

  role: "ADMIN",
  avatarUrl: null,
};
function appUnderTest(withAuthConfigRoute = false) {
  const app = new Hono<Env>();
  app.onError((error, c) =>
    c.json(
      { error: error.message },
      error instanceof HTTPException ? error.status : 500,
    ),
  );
  handleAuth(app);
  if (withAuthConfigRoute) {
    // Match production ordering: authentication precedes Hono's 404-based
    // trailing-slash redirect, then the actual public config route.
    app.use(trimTrailingSlash());
    app.route("/api/v4/auth", authRoute);
  } else {
    app.all("/api/*", (c) => c.json({ user: c.get("user") ?? null }));
  }
  return app;
}

describe("cookie-backed domain authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    mocks.findAccount.mockResolvedValue({
      id: "auth-id",
      name: "Account",
      role: "ADMIN",
    });
    mocks.findProfile.mockResolvedValue(profile);
  });
  it("rejects missing, expired or revoked sessions", async () => {
    expect((await appUnderTest().request("/api/v4/users")).status).toBe(401);
  });
  it("does not accept a legacy bearer token as authentication", async () => {
    expect(
      (
        await appUnderTest().request("/api/v4/users", {
          headers: { authorization: "Bearer legacy-jwt" },
        })
      ).status,
    ).toBe(401);
  });
  it("resolves fresh domain IDs and role data by auth user ID", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    const res = await appUnderTest().request("/api/v4/users", {
      headers: {
        cookie: "better-auth.session_token=signed",
        "x-profile-id": profile.id,
      },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toEqual(profile);
    expect(mocks.findAccount).toHaveBeenCalledWith({
      where: { id: "auth-id" },
      select: { id: true, name: true, role: true },
    });
    expect(mocks.getSession.mock.calls[0][0].headers.get("cookie")).toContain(
      "session_token",
    );
  });
  it("forwards renewed session cookies and disables caching on authenticated reads", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers({ "set-cookie": "session=renewed; HttpOnly" }),
    });
    const response = await appUnderTest().request("/api/v4/users", {
      headers: { "x-profile-id": profile.id },
    });
    expect(response.headers.get("set-cookie")).toContain("session=renewed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("uses only additional profiles owned by the authenticated account", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    mocks.findProfile.mockResolvedValue({
      ...profile,
      id: "extra-profile-id",
      accountId: "auth-id",
      role: "USER",
    });
    const own = await appUnderTest().request("/api/v4/users", {
      headers: { "x-profile-id": "extra-profile-id" },
    });
    expect((await own.json()).user).toMatchObject({
      id: "extra-profile-id",
      role: "ADMIN",
    });
    expect(mocks.findProfile).toHaveBeenCalledWith({
      where: { id: "extra-profile-id" },
    });

    mocks.findProfile.mockResolvedValue(null);
    const forged = await appUnderTest().request("/api/v4/users", {
      headers: { "x-profile-id": "someone-elses-profile" },
    });
    expect(forged.status).toBe(403);
  });
  it("uses account permissions while selecting another account's profile", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    mocks.findProfile.mockResolvedValue({
      ...profile,
      id: "shared-profile",
      accountId: "shared",
      role: "USER",
    });
    const response = await appUnderTest().request("/api/v4/users", {
      headers: { "x-account-id": "shared", "x-profile-id": "shared-profile" },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({
      id: "shared-profile",
      accountId: "shared",
      role: "ADMIN",
    });
  });
  it("rejects another account selection for an ordinary account", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    mocks.findAccount.mockResolvedValue({
      id: "auth-id",
      name: "Account",
      role: "USER",
    });
    expect(
      (
        await appUnderTest().request("/api/v4/users", {
          headers: { "x-account-id": "other" },
        })
      ).status,
    ).toBe(403);
    mocks.findProfile.mockResolvedValue({
      ...profile,
      id: "other-profile",
      accountId: "other",
    });
    expect(
      (
        await appUnderTest().request("/api/v4/users", {
          headers: { "x-profile-id": "other-profile" },
        })
      ).status,
    ).toBe(403);
  });
  it("requires explicit selection even when an account has profiles", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    expect((await appUnderTest().request("/api/v4/users/me")).status).toBe(409);
    expect(mocks.findProfile).not.toHaveBeenCalled();
    expect(
      (await appUnderTest().request("/api/v4/users/profiles")).status,
    ).toBe(200);
    expect((await appUnderTest().request("/api/v4/accounts/me")).status).toBe(
      200,
    );
  });
  it("does not select a profile when switching to another account", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    expect(
      (
        await appUnderTest().request("/api/v4/movies", {
          headers: { "x-account-id": "shared" },
        })
      ).status,
    ).toBe(409);
    expect(mocks.findProfile).not.toHaveBeenCalled();
  });
  it("allows configured public reads and exact auth config only", async () => {
    for (const path of [
      "/api/v4/public",
      "/api/v4/public/movies",
      "/api/v4/auth/config",
    ]) {
      expect((await appUnderTest().request(path)).status).toBe(200);
    }
    for (const path of [
      "/api/v4/publicity",
      "/api/v4/auth/configuration",
      "/api/v4/auth/sso/login",
    ]) {
      expect((await appUnderTest().request(path)).status).toBe(401);
    }
  });
  it.each(["GET", "HEAD"])(
    "redirects anonymous %s config/ requests to a successful config response",
    async (method) => {
      const app = appUnderTest(true);
      const redirect = await app.request("/api/v4/auth/config/?from=login", {
        method,
      });
      expect(redirect.status).toBe(301);
      const location = redirect.headers.get("location");
      expect(location).toBe("http://localhost/api/v4/auth/config?from=login");
      if (!location) throw new Error("Missing config redirect location");
      const response = await app.request(location, { method });
      expect(response.status).toBe(200);
      if (method === "GET") {
        expect(await response.json()).toMatchObject({
          status: "ok",
          data: { passwordAuthEnabled: true, signupEnabled: false },
        });
      }
      expect(mocks.findAccount).not.toHaveBeenCalled();
    },
  );
  it("answers anonymous requests to unknown paths with 404, not 401", async () => {
    const app = appUnderTest();
    expect((await app.request("/no/such/path")).status).toBe(404);
    expect((await app.request("/api/v4/users")).status).toBe(401);
  });
  it("keeps trailing-slash lookalikes and private paths protected", async () => {
    const app = appUnderTest(true);
    for (const path of [
      "/api/v4/auth/configuration/",
      "/api/v4/auth/config/private/",
      "/api/v4/auth/config//",
      "/api/v4/auth/config//private",
      "/api/v4/auth/sso/login/",
      "/api/v4/users/me/",
    ]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(401);
      expect(response.headers.get("location"), path).toBeNull();
    }
  });
  it("leaves Better Auth and secret-authenticated machine routes to their own guards", async () => {
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/v4/callback/complete",
      "/api/v4/vod/mapping",
    ]) {
      expect(
        (await appUnderTest().request(path, { method: "POST" })).status,
      ).toBe(200);
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(
      (
        await appUnderTest().request("/api/v4/callback-forged", {
          method: "POST",
        })
      ).status,
    ).toBe(403);
  });
  it("requires exact trusted origin for every application mutation", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    for (const origin of [
      undefined,
      "null",
      "https://evil.example.com",
      "https://video.example.com.evil.com",
    ]) {
      expect(
        (
          await appUnderTest().request("/api/v4/users/me", {
            method: "PATCH",
            headers: origin ? { origin } : {},
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await appUnderTest().request("/api/v4/users/me", {
          method: "PATCH",
          headers: {
            origin: "https://video.example.com",
            "x-profile-id": profile.id,
          },
        })
      ).status,
    ).toBe(200);
  });
  it("protects public mutations against cross-site form posts", async () => {
    expect(
      (
        await appUnderTest().request("/api/v4/public", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: "https://evil.example.com",
          },
          body: "title=csrf",
        })
      ).status,
    ).toBe(403);
  });
});
