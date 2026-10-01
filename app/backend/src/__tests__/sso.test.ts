import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/@types/hono";

// Mock Prisma before imports
const mockPrisma = {
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  session: {
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock rate limiter to bypass for integration tests
vi.mock("@/lib/rateLimiter", () => ({
  authRateLimiter: ((_, next) => next()) as MiddlewareHandler,
}));

// Mock Redis client
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({}),
}));

// Mock the OIDC exchange mechanics; the routes only need their outcomes.
// Everything else in the module (e.g. sanitizeCallback) stays real.
const mockBuildSsoAuthorizationUrl = vi.fn();
const mockHandleSsoCallback = vi.fn();

class MockOidcUserNotProvisionedError extends Error {
  constructor() {
    super("No user account is linked to this SSO identity");
    this.name = "OidcUserNotProvisionedError";
  }
}

class MockOidcLinkConflictError extends Error {
  constructor() {
    super("SSO identity conflict");
    this.name = "OidcLinkConflictError";
  }
}

class MockOidcLinkExpiredError extends Error {
  constructor() {
    super("SSO link expired");
    this.name = "OidcLinkExpiredError";
  }
}

class MockOidcLinkUserMismatchError extends Error {
  constructor() {
    super("SSO link user mismatch");
    this.name = "OidcLinkUserMismatchError";
  }
}

const mockConfirmOidcLink = vi.fn();

vi.mock("@/lib/oidc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oidc")>();
  return {
    ...actual,
    buildSsoAuthorizationUrl: (...args: unknown[]) =>
      mockBuildSsoAuthorizationUrl(...args),
    handleSsoCallback: (...args: unknown[]) => mockHandleSsoCallback(...args),
    confirmOidcLink: (...args: unknown[]) => mockConfirmOidcLink(...args),
    OidcUserNotProvisionedError: MockOidcUserNotProvisionedError,
    OidcLinkConflictError: MockOidcLinkConflictError,
    OidcLinkExpiredError: MockOidcLinkExpiredError,
    OidcLinkUserMismatchError: MockOidcLinkUserMismatchError,
  };
});

const OIDC_TEST_ENV = {
  OIDC_ENABLED: "true",
  OIDC_ISSUER_URL: "https://idp.example.com",
  OIDC_CLIENT_ID: "test-client-id",
  OIDC_REDIRECT_URI: "https://api.example.com/api/v4/auth/sso/callback",
};

const enableOidcEnv = () => {
  Object.assign(process.env, OIDC_TEST_ENV);
};

const clearOidcEnv = () => {
  for (const key of Object.keys(OIDC_TEST_ENV)) {
    delete process.env[key];
  }
};

const buildApp = async () => {
  const { authRoute } = await import("../routes/api/v4/auth");
  const { usersRoute } = await import("../routes/api/v4/users/index");
  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { status: "error", code: err.status, message: err.message },
        err.status,
      );
    }
    return c.json(
      { status: "error", code: 500, message: "Internal Server Error" },
      500,
    );
  });
  // Mirror the production auth middleware's Bearer handling: set `user`
  // when a valid token is presented (tests use a fixed sentinel token).
  app.use("*", async (c, next) => {
    if (c.req.header("authorization") === "Bearer test-session") {
      c.set("user", {
        id: "user-1",
        username: "u1",
        name: "U1",
        password: "hashed",
        role: "USER",
        avatarUrl: null,
        externalId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await next();
  });
  app.route("/auth", authRoute);
  app.route("/users", usersRoute);
  return app;
};

describe("GET /auth/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should return auth configuration flags", async () => {
    const app = await buildApp();
    const res = await app.request("/auth/config");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.data).toMatchObject({
      passwordAuthEnabled: true,
      ssoEnabled: false,
      ssoDisplayName: "SSO",
    });
  });
});

describe("GET /auth/sso/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should redirect to the provider authorization URL", async () => {
    enableOidcEnv();
    mockBuildSsoAuthorizationUrl.mockResolvedValue({
      url: new URL("https://idp.example.com/authorize?state=abc"),
      state: "abc",
    });
    const app = await buildApp();

    const res = await app.request("/auth/sso/login?callback=/movies");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://idp.example.com/authorize?state=abc",
    );
    expect(mockBuildSsoAuthorizationUrl).toHaveBeenCalledWith("/movies");
    clearOidcEnv();
  });

  it("should redirect to the frontend login error when SSO is disabled", async () => {
    const app = await buildApp();

    const res = await app.request("/auth/sso/login");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=sso_unavailable",
    );
    expect(mockBuildSsoAuthorizationUrl).not.toHaveBeenCalled();
  });
});

describe("POST /auth/sso/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should return 401 without a session token", async () => {
    enableOidcEnv();
    const app = await buildApp();

    const res = await app.request("/auth/sso/link", { method: "POST" });

    expect(res.status).toBe(401);
    clearOidcEnv();
  });

  it("should return the provider URL bound to the authenticated user", async () => {
    enableOidcEnv();
    mockBuildSsoAuthorizationUrl.mockResolvedValue({
      url: new URL("https://idp.example.com/authorize?state=link"),
      state: "link",
    });
    const app = await buildApp();

    const res = await app.request("/auth/sso/link?callback=/dashboard", {
      method: "POST",
      headers: { authorization: "Bearer test-session" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBe("https://idp.example.com/authorize?state=link");
    expect(mockBuildSsoAuthorizationUrl).toHaveBeenCalledWith(
      "/dashboard",
      "user-1",
    );
    clearOidcEnv();
  });

  it("should return 403 when SSO is disabled", async () => {
    const app = await buildApp();

    const res = await app.request("/auth/sso/link", {
      method: "POST",
      headers: { authorization: "Bearer test-session" },
    });

    expect(res.status).toBe(403);
    expect(mockBuildSsoAuthorizationUrl).not.toHaveBeenCalled();
  });
});

describe("GET /auth/sso/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should redirect to the frontend callback with the session token", async () => {
    enableOidcEnv();
    mockHandleSsoCallback.mockResolvedValue({
      kind: "session",
      token: "session-token-123",
      callback: "/movies",
    });
    const app = await buildApp();

    const res = await app.request(
      "/auth/sso/callback?code=auth-code&state=abc",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/auth/callback#token=session-token-123&callback=%2Fmovies",
    );
    clearOidcEnv();
  });

  it("should redirect to frontend login error when the user is not provisioned", async () => {
    enableOidcEnv();
    mockHandleSsoCallback.mockRejectedValue(
      new MockOidcUserNotProvisionedError(),
    );
    const app = await buildApp();

    const res = await app.request(
      "/auth/sso/callback?code=auth-code&state=abc",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=sso_user_not_found",
    );
    clearOidcEnv();
  });

  it("should redirect to the frontend link page on account-link flows", async () => {
    enableOidcEnv();
    mockHandleSsoCallback.mockResolvedValue({
      kind: "link",
      linkToken: "link-token-abc",
      callback: "/dashboard",
    });
    const app = await buildApp();

    const res = await app.request(
      "/auth/sso/callback?code=auth-code&state=abc",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/auth/link#token=link-token-abc&callback=%2Fdashboard",
    );
    clearOidcEnv();
  });

  it("should redirect to frontend login error on link conflict", async () => {
    enableOidcEnv();
    mockHandleSsoCallback.mockRejectedValue(new MockOidcLinkConflictError());
    const app = await buildApp();

    const res = await app.request(
      "/auth/sso/callback?code=auth-code&state=abc",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=sso_identity_taken",
    );
    clearOidcEnv();
  });

  it("should redirect to frontend login error on generic failure", async () => {
    enableOidcEnv();
    mockHandleSsoCallback.mockRejectedValue(new Error("bad state"));
    const app = await buildApp();

    const res = await app.request(
      "/auth/sso/callback?code=auth-code&state=abc",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?error=sso_failed",
    );
    clearOidcEnv();
  });
});

describe("POST /auth/sso/link/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should return 401 without a session token", async () => {
    enableOidcEnv();
    const app = await buildApp();

    const res = await app.request("/auth/sso/link/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "link-token-abc" }),
    });

    expect(res.status).toBe(401);
    expect(mockConfirmOidcLink).not.toHaveBeenCalled();
    clearOidcEnv();
  });

  it("should confirm the pending link for the session user", async () => {
    enableOidcEnv();
    mockConfirmOidcLink.mockResolvedValue({ id: "user-1" });
    const app = await buildApp();

    const res = await app.request("/auth/sso/link/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-session",
      },
      body: JSON.stringify({ token: "link-token-abc" }),
    });

    expect(res.status).toBe(200);
    expect(mockConfirmOidcLink).toHaveBeenCalledWith(
      "link-token-abc",
      "user-1",
    );
    clearOidcEnv();
  });

  it("should return 403 when the link was started by another account", async () => {
    enableOidcEnv();
    mockConfirmOidcLink.mockRejectedValue(new MockOidcLinkUserMismatchError());
    const app = await buildApp();

    const res = await app.request("/auth/sso/link/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-session",
      },
      body: JSON.stringify({ token: "link-token-abc" }),
    });

    expect(res.status).toBe(403);
    clearOidcEnv();
  });

  it("should return 400 when the link token is expired or unknown", async () => {
    enableOidcEnv();
    mockConfirmOidcLink.mockRejectedValue(new MockOidcLinkExpiredError());
    const app = await buildApp();

    const res = await app.request("/auth/sso/link/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-session",
      },
      body: JSON.stringify({ token: "link-token-abc" }),
    });

    expect(res.status).toBe(400);
    clearOidcEnv();
  });

  it("should return 400 when the identity is already linked elsewhere", async () => {
    enableOidcEnv();
    mockConfirmOidcLink.mockRejectedValue(new MockOidcLinkConflictError());
    const app = await buildApp();

    const res = await app.request("/auth/sso/link/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-session",
      },
      body: JSON.stringify({ token: "link-token-abc" }),
    });

    expect(res.status).toBe(400);
    clearOidcEnv();
  });
});

describe("PASSWORD_AUTH_ENABLED=false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.PASSWORD_AUTH_ENABLED = "false";
    enableOidcEnv();
  });

  afterEach(() => {
    delete process.env.PASSWORD_AUTH_ENABLED;
    clearOidcEnv();
  });

  it("should reject password login with 403", async () => {
    const app = await buildApp();

    const res = await app.request("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "password",
        username: "testuser",
        password: "somepassword",
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toBe("Password authentication is disabled");
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("should still allow token refresh", async () => {
    const testSession = {
      id: "session-123",
      token: "valid-refresh-token",
      userId: "user-123",
      expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };
    mockPrisma.session.findFirst.mockResolvedValue(testSession);
    mockPrisma.session.create.mockResolvedValue(testSession);
    const app = await buildApp();

    const res = await app.request("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "token",
        token: "valid-refresh-token",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("should reject password-based signup with 403", async () => {
    const app = await buildApp();

    const res = await app.request("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "newuser",
        name: "New User",
        password: "Password1!",
      }),
    });

    expect(res.status).toBe(403);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("sanitizeCallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should accept safe relative paths", async () => {
    const { sanitizeCallback } = await import("../lib/oidc");
    expect(sanitizeCallback("/movies")).toBe("/movies");
    // Input is already URL-decoded by Hono — encoded input must NOT be
    // decoded again, and literal percent paths pass through untouched.
    expect(sanitizeCallback("%2Fseries%2Fabc")).toBeNull();
    expect(sanitizeCallback("/movies/%25abc")).toBe("/movies/%25abc");
    expect(sanitizeCallback(null)).toBeNull();
  });

  it("should reject absolute URLs and protocol-relative paths", async () => {
    const { sanitizeCallback } = await import("../lib/oidc");
    expect(sanitizeCallback("https://evil.example.com")).toBeNull();
    expect(sanitizeCallback("//evil.example.com")).toBeNull();
    expect(sanitizeCallback("%2F%2Fevil.example.com")).toBeNull();
    expect(sanitizeCallback("movies")).toBeNull();
    expect(sanitizeCallback("%invalid")).toBeNull();
  });
});
