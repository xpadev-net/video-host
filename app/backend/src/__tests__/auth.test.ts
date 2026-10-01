import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>[]>,
  profiles: new Map<string, Record<string, unknown>>(),
  env: {
    AUTH_TRUSTED_ORIGINS: ["https://video.example.com"],
    BETTER_AUTH_URL: "https://video.example.com",
    BETTER_AUTH_SECRET: "test-auth-secret-with-at-least-thirty-two-characters",
    OIDC_ENABLED: false,
    OIDC_ISSUER_URL: undefined,
    OIDC_CLIENT_ID: undefined,
    OIDC_CLIENT_SECRET: undefined,
    OIDC_SCOPE: "openid profile email",
    OIDC_AUTO_PROVISION: true,
    PASSWORD_AUTH_ENABLED: true,
    SIGNUP_ENABLED: true,
    SIGNUP_CODE: "test-invite",
  },
}));
vi.mock("@/env", () => fixture.env);
vi.mock("better-auth/adapters/prisma", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    prismaAdapter:
      () => (options: Parameters<ReturnType<typeof memoryAdapter>>[0]) => {
        const adapter = memoryAdapter(fixture.db)(options);
        // Match production prismaAdapter(transaction:false), not the memory
        // adapter's snapshot rollback. This matters for partial-failure recovery.
        adapter.transaction = async (callback) => callback(adapter);
        return adapter;
      },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(async ({ where, create }) => {
        const prior = fixture.profiles.get(where.authUserId);
        if (prior) return prior;
        const profile = { id: `domain-${where.authUserId}`, ...create };
        fixture.profiles.set(where.authUserId, profile);
        return profile;
      }),
    },
    authUser: {
      findUnique: vi.fn(async ({ where }) =>
        fixture.db.AuthUser.find((user) => user.id === where.id),
      ),
    },
  },
}));

let auth: typeof import("@/lib/auth")["auth"];
function call(path: string, body?: unknown, cookie?: string) {
  return auth.handler(
    new Request(`https://video.example.com/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "https://video.example.com",
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.5",
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
const credentials = {
  email: "human@example.com",
  password: "A-good-password-123",
  name: "Human",
  signupCode: "test-invite",
};
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
async function signup() {
  const response = await call("/sign-up/email", credentials);
  expect(response.status, await response.clone().text()).toBe(200);
  return response;
}

beforeEach(async () => {
  vi.resetModules();
  fixture.env.PASSWORD_AUTH_ENABLED = true;
  fixture.env.SIGNUP_ENABLED = true;
  fixture.profiles.clear();
  for (const key of Object.keys(fixture.db)) delete fixture.db[key];
  for (const model of [
    "AuthUser",
    "AuthSession",
    "AuthAccount",
    "AuthVerification",
    "AuthRateLimit",
  ])
    fixture.db[model] = [];
  ({ auth } = await import("../lib/auth.js"));
});

describe("real Better Auth HTTP handler", () => {
  it("enforces signup code without persisting it", async () => {
    for (const signupCode of [undefined, "wrong"]) {
      expect(
        (await call("/sign-up/email", { ...credentials, signupCode })).status,
      ).toBe(403);
    }
    await signup();
    expect(fixture.db.AuthUser).toHaveLength(1);
    expect(fixture.db.AuthUser[0]).not.toHaveProperty("signupCode");
    expect(fixture.db.AuthAccount[0].password).not.toEqual(
      credentials.password,
    );
    expect([...fixture.profiles.values()][0]).toMatchObject({
      kind: "HUMAN",
      role: "USER",
    });
  });
  it("issues secure HttpOnly cookies, reads the session and logs out with revocation", async () => {
    const response = await signup();
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    const cookie = cookieFrom(response);
    const session = await call("/get-session", undefined, cookie);
    expect((await session.json()).user.email).toBe(credentials.email);
    const logout = await call("/sign-out", {}, cookie);
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      await (await call("/get-session", undefined, cookie)).json(),
    ).toBeNull();
    expect(fixture.db.AuthSession).toHaveLength(0);
  });
  it("authenticates email and password and rejects an incorrect password", async () => {
    await signup();
    expect(
      (
        await call("/sign-in/email", {
          email: credentials.email,
          password: "incorrect",
        })
      ).status,
    ).toBe(401);
    const response = await call("/sign-in/email", credentials);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });
  it("rejects expired and database-revoked sessions without cookie caching", async () => {
    const response = await signup();
    const cookie = cookieFrom(response);
    fixture.db.AuthSession[0].expiresAt = new Date(Date.now() - 1000);
    expect(
      await (await call("/get-session", undefined, cookie)).json(),
    ).toBeNull();
    const signedIn = await call("/sign-in/email", credentials);
    fixture.db.AuthSession.splice(0);
    expect(
      await (
        await call("/get-session", undefined, cookieFrom(signedIn))
      ).json(),
    ).toBeNull();
  });
  it("rejects tampered cookies and does not accept legacy bearer tokens", async () => {
    await signup();
    for (const headers of [
      new Headers({ cookie: "__Secure-better-auth.session_token=forged" }),
      new Headers({ authorization: "Bearer legacy.jwt.token" }),
    ]) {
      const response = await auth.handler(
        new Request("https://video.example.com/api/auth/get-session", {
          headers,
        }),
      );
      expect(await response.json()).toBeNull();
    }
  });
  it("enforces disabled signup and password authentication", async () => {
    fixture.env.SIGNUP_ENABLED = false;
    vi.resetModules();
    ({ auth } = await import("../lib/auth.js"));
    expect((await call("/sign-up/email", credentials)).status).toBe(403);
    fixture.env.PASSWORD_AUTH_ENABLED = false;
    vi.resetModules();
    ({ auth } = await import("../lib/auth.js"));
    expect((await call("/sign-in/email", credentials)).status).toBe(400);
  });
  it("blocks cross-site cookie-authenticated mutations", async () => {
    const response = await signup();
    const result = await auth.handler(
      new Request("https://video.example.com/api/auth/sign-out", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          cookie: cookieFrom(response),
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(result.status).toBe(403);
    expect(fixture.db.AuthSession).toHaveLength(1);
  });
  it("uses a shared rate-limit table for authentication requests", async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      await call("/sign-in/email", credentials);
    expect((await call("/sign-in/email", credentials)).status).toBe(429);
    expect(fixture.db.AuthRateLimit.length).toBeGreaterThan(0);
  });
  it("can recover when profile provisioning fails during the first signup", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(
      new Error("Simulated first-signup profile failure"),
    );
    const failed = await call("/sign-up/email", credentials);
    expect(failed.status).not.toBe(200);
    expect(fixture.db.AuthSession).toHaveLength(0);
    expect(fixture.db.AuthAccount).toHaveLength(1);
    expect(fixture.db.AuthAccount[0].providerId).toBe("credential");
    const retry = await call("/sign-in/email", credentials);
    expect(retry.status).toBe(200);
    expect(fixture.profiles.size).toBe(1);
    expect(fixture.db.AuthSession).toHaveLength(1);
  });
  it("repairs a missing profile idempotently and withholds sessions if provisioning fails", async () => {
    await signup();
    fixture.db.AuthSession.splice(0);
    fixture.profiles.clear();
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(
      new Error("Simulated profile database failure"),
    );
    const failed = await call("/sign-in/email", credentials);
    expect(failed.status).not.toBe(200);
    expect(fixture.db.AuthSession).toHaveLength(0);
    const retry = await call("/sign-in/email", credentials);
    expect(retry.status).toBe(200);
    expect(fixture.profiles.size).toBe(1);
    const profile = [...fixture.profiles.values()][0];
    profile.role = "ADMIN";
    const domainId = profile.id;
    expect((await call("/sign-in/email", credentials)).status).toBe(200);
    expect([...fixture.profiles.values()][0]).toMatchObject({
      id: domainId,
      role: "ADMIN",
    });
  });
  it("never issues a human session for a SYSTEM profile mapping", async () => {
    await signup();
    fixture.db.AuthSession.splice(0);
    [...fixture.profiles.values()][0].kind = "SYSTEM";
    expect((await call("/sign-in/email", credentials)).status).not.toBe(200);
    expect(fixture.db.AuthSession).toHaveLength(0);
  });
});
