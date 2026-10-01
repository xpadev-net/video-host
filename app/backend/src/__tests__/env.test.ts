import { describe, expect, it } from "vitest";
import { DEV_DEFAULTS, EnvSchema } from "../env";

const production = (changes: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://video.example.com",
  FRONTEND_URL: "https://video.example.com",
  AUTH_TRUSTED_PROXY_CIDRS: "10.0.0.2/32, 2001:db8:100::/48",
  CALLBACK_SECRET: "synthetic-callback-secret",
  VOD_INTERNAL_SECRET: "synthetic-vod-secret",
  ...changes,
});
const oidc = {
  OIDC_ENABLED: "true",
  OIDC_CLIENT_ID: "test-client",
  OIDC_ISSUER_URL: "https://identity.example.com/realms/video",
};

describe("authentication environment", () => {
  it("accepts complete production configuration", () => {
    expect(EnvSchema.safeParse(production()).success).toBe(true);
  });
  it.each([
    "AUTH_TRUSTED_PROXY_CIDRS",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "FRONTEND_URL",
    "CALLBACK_SECRET",
    "VOD_INTERNAL_SECRET",
  ])("requires %s outside development", (key) => {
    expect(EnvSchema.safeParse(production({ [key]: undefined })).success).toBe(
      false,
    );
  });
  it.each([
    "",
    "*",
    "0.0.0.0/0",
    "::/0",
    "::ffff:0.0.0.0/96",
    "10.0.0.2/33",
    "CHANGE_ME_proxy_CIDRs",
  ])("rejects invalid production proxy trust %s", (value) => {
    expect(
      EnvSchema.safeParse(production({ AUTH_TRUSTED_PROXY_CIDRS: value }))
        .success,
    ).toBe(false);
  });
  it("rejects short auth secrets", () => {
    expect(
      EnvSchema.safeParse(production({ BETTER_AUTH_SECRET: "short" })).success,
    ).toBe(false);
  });
  it("rejects development and placeholder production secrets", () => {
    expect(
      EnvSchema.safeParse(
        production({ BETTER_AUTH_SECRET: DEV_DEFAULTS.BETTER_AUTH_SECRET }),
      ).success,
    ).toBe(false);
    expect(
      EnvSchema.safeParse(
        production({
          BETTER_AUTH_SECRET: "CHANGE_ME_at_least_thirty_two_characters",
        }),
      ).success,
    ).toBe(false);
  });
  it("uses development defaults only for explicit parsed development mode", () => {
    const env = EnvSchema.parse({ NODE_ENV: "development" });
    expect(env.BETTER_AUTH_SECRET).toBe(DEV_DEFAULTS.BETTER_AUTH_SECRET);
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(EnvSchema.safeParse({}).success).toBe(false);
    expect(EnvSchema.safeParse({ NODE_ENV: "test" }).success).toBe(false);
  });
  it.each([
    "http://video.example.com",
    "https://video.example.com/path",
    "https://user:password@video.example.com",
    "https://video.example.com?x=1",
    "https://video.example.com#fragment",
  ])("rejects unsafe production public origin %s", (value) => {
    expect(
      EnvSchema.safeParse(production({ BETTER_AUTH_URL: value })).success,
    ).toBe(false);
  });
  it("deduplicates exact trusted origins and rejects wildcard matching", () => {
    const env = EnvSchema.parse(
      production({
        AUTH_TRUSTED_ORIGINS:
          "https://video.example.com, https://other.example.com",
        CORS_ORIGIN: "https://third.example.com",
      }),
    );
    expect(env.AUTH_TRUSTED_ORIGINS).toEqual([
      "https://video.example.com",
      "https://other.example.com",
      "https://third.example.com",
    ]);
    expect(
      EnvSchema.safeParse(production({ AUTH_TRUSTED_ORIGINS: "*" })).success,
    ).toBe(false);
  });
  it("defaults to password auth with signup disabled", () => {
    const env = EnvSchema.parse(production());
    expect(env.PASSWORD_AUTH_ENABLED).toBe(true);
    expect(env.SIGNUP_ENABLED).toBe(false);
    expect(env.OIDC_ENABLED).toBe(false);
  });
  it("supports SSO-only mode and rejects no enabled method", () => {
    expect(
      EnvSchema.safeParse(
        production({ ...oidc, PASSWORD_AUTH_ENABLED: "false" }),
      ).success,
    ).toBe(true);
    expect(
      EnvSchema.safeParse(production({ PASSWORD_AUTH_ENABLED: "false" }))
        .success,
    ).toBe(false);
  });
  it("requires OIDC issuer and client ID", () => {
    expect(
      EnvSchema.safeParse(production({ OIDC_ENABLED: "true" })).success,
    ).toBe(false);
  });
  it("requires openid/email scopes and HTTPS discovery", () => {
    expect(
      EnvSchema.safeParse(production({ ...oidc, OIDC_SCOPE: "openid profile" }))
        .success,
    ).toBe(false);
    expect(
      EnvSchema.safeParse(
        production({ ...oidc, OIDC_ISSUER_URL: "http://identity.example.com" }),
      ).success,
    ).toBe(false);
    expect(
      EnvSchema.safeParse(production({ ...oidc, OIDC_ALLOW_HTTP: "true" }))
        .success,
    ).toBe(false);
  });
  it("allows local HTTP IdP only when explicitly enabled in development", () => {
    expect(
      EnvSchema.safeParse({
        NODE_ENV: "development",
        ...oidc,
        OIDC_ALLOW_HTTP: "true",
        OIDC_ISSUER_URL: "http://localhost:4000",
      }).success,
    ).toBe(true);
  });
  it("tolerates empty disabled OIDC settings", () => {
    expect(
      EnvSchema.safeParse(
        production({ OIDC_ISSUER_URL: "", OIDC_CLIENT_ID: "", OIDC_SCOPE: "" }),
      ).success,
    ).toBe(true);
  });
});
