import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { trimTrailingSlash } from "hono/trailing-slash";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/@types/hono";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findUnique: vi.fn() }));
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
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import { handleAuth } from "@/middleware/auth";
import { authRoute } from "@/routes/api/v4/auth";

const profile = {
  id: "domain-id",
  authUserId: "auth-id",
  kind: "HUMAN",
  role: "ADMIN",
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
    app.all("*", (c) => c.json({ user: c.get("user") ?? null }));
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
    mocks.findUnique.mockResolvedValue(profile);
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
      headers: { cookie: "better-auth.session_token=signed" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toEqual(profile);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authUserId: "auth-id" },
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
    const response = await appUnderTest().request("/api/v4/users");
    expect(response.headers.get("set-cookie")).toContain("session=renewed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects SYSTEM profiles and missing domain mappings", async () => {
    mocks.getSession.mockResolvedValue({
      response: { user: { id: "auth-id" } },
      headers: new Headers(),
    });
    for (const user of [{ ...profile, kind: "SYSTEM" }, null]) {
      mocks.findUnique.mockResolvedValue(user);
      expect((await appUnderTest().request("/api/v4/users")).status).toBe(401);
    }
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
  it.each([
    "GET",
    "HEAD",
  ])("redirects anonymous %s config/ requests to a successful config response", async (method) => {
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
    expect(mocks.findUnique).not.toHaveBeenCalled();
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
          headers: { origin: "https://video.example.com" },
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
