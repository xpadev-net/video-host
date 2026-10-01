import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>[]>,
  profiles: new Map<string, Record<string, unknown>>(),
  claims: new Map<string, Record<string, unknown>>(),
  omitIdToken: false,
  badSignature: false,
  challenges: new Map<string, string>(),
  env: {
    AUTH_TRUSTED_ORIGINS: ["https://video.example.com"],
    BETTER_AUTH_URL: "https://video.example.com",
    BETTER_AUTH_SECRET: "test-auth-secret-with-at-least-thirty-two-characters",
    OIDC_ENABLED: true,
    OIDC_ISSUER_URL: "https://idp.example.com",
    OIDC_CLIENT_ID: "test-client",
    OIDC_CLIENT_SECRET: "test-client-secret",
    OIDC_SCOPE: "openid profile email",
    OIDC_AUTO_PROVISION: true,
    PASSWORD_AUTH_ENABLED: true,
    SIGNUP_ENABLED: true,
    SIGNUP_CODE: undefined,
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

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
function jwt(claims: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const message = `${header}.${payload}`;
  return `${message}.${sign("RSA-SHA256", Buffer.from(message), privateKey).toString("base64url")}`;
}
function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}
let auth: typeof import("@/lib/auth")["auth"];
let providerId: string;
let codeSequence = 0;
function request(path: string, body?: unknown, cookie = "") {
  return auth.handler(
    new Request(`https://video.example.com/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "https://video.example.com",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function startFlow(linkCookie = "") {
  const response = await request(
    linkCookie ? "/link-social" : "/sign-in/social",
    {
      provider: providerId,
      callbackURL: "https://video.example.com/auth/callback",
      errorCallbackURL: "https://video.example.com/login",
      disableRedirect: true,
    },
    linkCookie,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("nonce")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri")).toBe(
    `https://video.example.com/api/auth/callback/${providerId}`,
  );
  const code = `code-${++codeSequence}`;
  fixture.challenges.set(
    code,
    url.searchParams.get("code_challenge") as string,
  );
  fixture.claims.set(code, {
    iss: fixture.env.OIDC_ISSUER_URL,
    aud: fixture.env.OIDC_CLIENT_ID,
    sub: "provider-subject",
    email: "sso@example.com",
    email_verified: true,
    name: "SSO Human",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: url.searchParams.get("nonce"),
  });
  return {
    code,
    state: url.searchParams.get("state") as string,
    cookie: cookies(response),
  };
}
function finishFlow(
  flow: Awaited<ReturnType<typeof startFlow>>,
  sessionCookie = "",
) {
  return request(
    `/callback/${providerId}?code=${flow.code}&state=${encodeURIComponent(flow.state)}`,
    undefined,
    `${flow.cookie}${sessionCookie ? `; ${sessionCookie}` : ""}`,
  );
}
async function createPasswordUser(email: string) {
  const response = await request("/sign-up/email", {
    email,
    password: "A-good-password-123",
    name: "Password Human",
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return { cookie: cookies(response), user: (await response.json()).user };
}

beforeEach(async () => {
  vi.resetModules();
  fixture.env.OIDC_AUTO_PROVISION = true;
  fixture.omitIdToken = false;
  fixture.badSignature = false;
  fixture.challenges.clear();
  fixture.claims.clear();
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/.well-known/openid-configuration"))
        return jsonResponse({
          issuer: fixture.env.OIDC_ISSUER_URL,
          authorization_endpoint: "https://idp.example.com/authorize",
          token_endpoint: "https://idp.example.com/token",
          jwks_uri: "https://idp.example.com/jwks",
          id_token_signing_alg_values_supported: ["RS256"],
        });
      if (url === "https://idp.example.com/jwks")
        return jsonResponse({ keys: [jwk] });
      if (url === "https://idp.example.com/token") {
        const body = new URLSearchParams(String(init?.body));
        const verifier = body.get("code_verifier");
        expect(verifier).toBeTruthy();
        expect(
          createHash("sha256")
            .update(verifier ?? "")
            .digest("base64url"),
        ).toBe(fixture.challenges.get(body.get("code") ?? ""));
        const claims = fixture.claims.get(body.get("code") ?? "");
        if (!claims) return new Response("Invalid code", { status: 400 });
        return jsonResponse({
          access_token: "access-token",
          token_type: "Bearer",
          expires_in: 300,
          ...(fixture.omitIdToken
            ? {}
            : {
                id_token: fixture.badSignature
                  ? `${jwt(claims).split(".").slice(0, 2).join(".")}.invalid-signature`
                  : jwt(claims),
              }),
        });
      }
      throw new Error(`Unexpected IdP request: ${url}`);
    }),
  );
  const module = await import("../lib/auth.js");
  auth = module.auth;
  providerId = module.ssoProviderId as string;
  await auth.$context;
});
afterEach(() => vi.unstubAllGlobals());

describe("real generic OIDC redirect flow", () => {
  it("verifies a signed ID token, provisions a HUMAN and binds immutable provider identity", async () => {
    const flow = await startFlow();
    const response = await finishFlow(flow);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://video.example.com/auth/callback",
    );
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(fixture.db.AuthAccount[0]).toMatchObject({
      providerId,
      accountId: createHash("sha256").update("provider-subject").digest("hex"),
    });
    expect([...fixture.profiles.values()][0]).toMatchObject({
      kind: "HUMAN",
      role: "USER",
    });
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
  });
  it.each([
    "nonce",
    "aud",
    "iss",
  ])("rejects mismatched %s before creating an identity", async (claim) => {
    const flow = await startFlow();
    const claims = fixture.claims.get(flow.code);
    if (!claims) throw new Error("Missing test claims");
    claims[claim] = "invalid";
    const response = await finishFlow(flow);
    expect(response.headers.get("location")).toContain("error=");
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it.each([
    "email",
    "sub",
  ])("rejects missing %s rather than fabricating identity data", async (claim) => {
    const flow = await startFlow();
    delete fixture.claims.get(flow.code)?.[claim];
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("rejects absent ID tokens and unsolicited callbacks", async () => {
    const flow = await startFlow();
    fixture.omitIdToken = true;
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(
      (await request(`/callback/${providerId}?code=x`)).headers.get("location"),
    ).toContain("state_not_found");
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("does not implicitly merge a provider into an email-matching local account", async () => {
    await createPasswordUser("sso@example.com");
    const flow = await startFlow();
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=account_not_linked",
    );
    expect(fixture.db.AuthUser).toHaveLength(1);
    expect(fixture.db.AuthAccount).toHaveLength(1);
    expect(fixture.db.AuthAccount[0].providerId).toBe("credential");
  });
  it("links explicitly only while the initiating browser identity is still active", async () => {
    const user = await createPasswordUser("sso@example.com");
    const flow = await startFlow(user.cookie);
    const response = await finishFlow(flow, user.cookie);
    expect(response.headers.get("location")).toBe(
      "https://video.example.com/auth/callback",
    );
    expect(
      fixture.db.AuthAccount.find(
        (account) => account.providerId === providerId,
      )?.userId,
    ).toBe(user.user.id);
    expect(fixture.db.AuthUser).toHaveLength(1);
    const current = await request("/get-session", undefined, user.cookie);
    expect((await current.json()).user.id).toBe(user.user.id);
  });
  it("rejects a link callback after signout or switching to another user", async () => {
    const initiator = await createPasswordUser("sso@example.com");
    const other = await createPasswordUser("other@example.com");
    for (const cookie of [other.cookie, ""]) {
      const flow = await startFlow(initiator.cookie);
      const response = await finishFlow(flow, cookie);
      expect(response.headers.get("location")).toContain(
        "link_session_mismatch",
      );
    }
    expect(
      fixture.db.AuthAccount.filter(
        (account) => account.providerId === providerId,
      ),
    ).toHaveLength(0);
  });
  it("honors disabled OIDC auto-provisioning", async () => {
    fixture.env.OIDC_AUTO_PROVISION = false;
    vi.resetModules();
    ({ auth } = await import("../lib/auth.js"));
    const flow = await startFlow();
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("rejects external callback URLs and direct ID-token shortcuts", async () => {
    expect(
      (
        await request("/sign-in/social", {
          provider: providerId,
          callbackURL: "https://evil.example.com",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/sign-in/social", {
          provider: providerId,
          idToken: { token: "unbound-token" },
        })
      ).status,
    ).toBe(403);
  });
  it("rejects a token with an invalid cryptographic signature", async () => {
    const flow = await startFlow();
    fixture.badSignature = true;
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("rejects a callback without its initiating OAuth state cookie", async () => {
    const flow = await startFlow();
    flow.cookie = "";
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("keeps case- and trailing-space-distinct subjects separate under MySQL collation", async () => {
    for (const [index, subject] of [
      "subject",
      "SUBJECT",
      "subject ",
    ].entries()) {
      const flow = await startFlow();
      const claims = fixture.claims.get(flow.code);
      if (!claims) throw new Error("Missing test claims");
      claims.sub = subject;
      claims.email = `subject-${index}@example.com`;
      expect((await finishFlow(flow)).headers.get("location")).toBe(
        "https://video.example.com/auth/callback",
      );
    }
    const ids = fixture.db.AuthAccount.map((account) => account.accountId);
    expect(new Set(ids).size).toBe(3);
    expect(
      ids.every((id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id)),
    ).toBe(true);
  });
  it.each([
    "x".repeat(256),
    "subject\u0000",
    "subject\ud800",
  ])("rejects oversized or malformed subject %#", async (subject) => {
    const flow = await startFlow();
    const claims = fixture.claims.get(flow.code);
    if (!claims) throw new Error("Missing test claims");
    claims.sub = subject;
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it.each([
    "exp",
    "iat",
  ])("rejects signed ID tokens missing %s", async (claim) => {
    const flow = await startFlow();
    delete fixture.claims.get(flow.code)?.[claim];
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it.each([
    ["expired expiry", "exp", Math.floor(Date.now() / 1000) - 60],
    ["string expiry", "exp", "9999999999"],
    ["null issued-at", "iat", null],
    ["future issued-at", "iat", Math.floor(Date.now() / 1000) + 3600],
  ])("rejects signed ID tokens with %s", async (_description, claim, value) => {
    const flow = await startFlow();
    const claims = fixture.claims.get(flow.code);
    if (!claims) throw new Error("Missing test claims");
    claims[String(claim)] = value;
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("rejects signed ID tokens expiring before their issued-at time", async () => {
    const flow = await startFlow();
    const claims = fixture.claims.get(flow.code);
    if (!claims) throw new Error("Missing test claims");
    const now = Math.floor(Date.now() / 1000);
    claims.iat = now + 30;
    claims.exp = now + 20;
    expect((await finishFlow(flow)).headers.get("location")).toContain(
      "error=",
    );
    expect(fixture.db.AuthUser).toHaveLength(0);
  });
  it("allows a small issued-at clock skew within the documented 60 seconds", async () => {
    const flow = await startFlow();
    const claims = fixture.claims.get(flow.code);
    if (!claims) throw new Error("Missing test claims");
    claims.iat = Math.floor(Date.now() / 1000) + 30;
    expect((await finishFlow(flow)).headers.get("location")).toBe(
      "https://video.example.com/auth/callback",
    );
    expect(fixture.db.AuthUser).toHaveLength(1);
  });
});
