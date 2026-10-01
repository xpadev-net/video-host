import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { z } from "zod";
import {
  AUTH_TRUSTED_ORIGINS,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  OIDC_AUTO_PROVISION,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ENABLED,
  OIDC_ISSUER_URL,
  OIDC_SCOPE,
  PASSWORD_AUTH_ENABLED,
  SIGNUP_CODE,
  SIGNUP_ENABLED,
} from "@/env";
import {
  oidcAccountId,
  oidcProviderId,
  signupCodeMatches,
} from "@/lib/auth-policy";
import { provisionAuthProfile } from "@/lib/auth-profile";
import { prisma } from "@/lib/prisma";

// Permit at most 60 seconds of IdP clock skew for issued-at, while expiration
// remains strict. Both NumericDate claims are mandatory for every OIDC token.
const OIDC_IAT_CLOCK_TOLERANCE_SECONDS = 60;

export const ssoProviderId =
  OIDC_ENABLED && OIDC_ISSUER_URL ? oidcProviderId(OIDC_ISSUER_URL) : null;

// The callback guard below requires the initiating identity to remain active.
export const accountLinkingEnabled = OIDC_ENABLED;

export const auth = betterAuth({
  appName: "Video Host",
  telemetry: { enabled: false },
  baseURL: BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: BETTER_AUTH_SECRET,
  trustedOrigins: AUTH_TRUSTED_ORIGINS,
  // Profile provisioning uses the application Prisma client at the session
  // gate. Keep auth writes committed before that independent FK-bearing write.
  database: prismaAdapter(prisma, { provider: "mysql", transaction: false }),
  advanced: {
    database: { generateId: "uuid" },
    disableCSRFCheck: false,
    disableOriginCheck: false,
    ipAddress: { ipAddressHeaders: [] },
    useSecureCookies: new URL(BETTER_AUTH_URL).protocol === "https:",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
  },
  emailAndPassword: {
    enabled: PASSWORD_AUTH_ENABLED,
    disableSignUp: !SIGNUP_ENABLED,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    modelName: "AuthUser",
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
    validateUserInfo: async ({ user, source }, context) => {
      if (!z.email().safeParse(user.email).success) {
        return {
          error: "email_required",
          errorDescription: "A valid email is required",
        };
      }
      if (typeof user.name !== "string" || user.name.length > 191) {
        return {
          error: "invalid_name",
          errorDescription: "Name must be at most 191 characters",
        };
      }
      if (source.action === "link-account") {
        const current = await getAuthoritativeSessionFromCtx(context);
        if (!current || current.user.id !== user.id) {
          return {
            error: "link_session_mismatch",
            errorDescription:
              "Sign in with the account that started this link and try again",
          };
        }
      }
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  account: {
    modelName: "AuthAccount",
    accountLinking: { enabled: true, disableImplicitLinking: true },
    encryptOAuthTokens: true,
  },
  verification: { modelName: "AuthVerification" },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "AuthRateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },
  plugins: [
    ...(ssoProviderId && OIDC_ISSUER_URL && OIDC_CLIENT_ID
      ? [
          genericOAuth({
            config: [
              {
                providerId: ssoProviderId,
                // MySQL's default case-insensitive/PAD SPACE collation must
                // never merge distinct subjects. Hash the verified exact sub.
                accountSubject: ({ profile }) => {
                  if (typeof profile.sub !== "string")
                    throw new Error("Missing OIDC subject");
                  return oidcAccountId(profile.sub);
                },
                clientId: OIDC_CLIENT_ID,
                clientSecret: OIDC_CLIENT_SECRET,
                discoveryUrl: `${OIDC_ISSUER_URL.replace(/\/+$/, "")}/.well-known/openid-configuration`,
                requireIdTokenVerification: true,
                pkce: true,
                // v1.7.7 verifies signature, issuer, audience and nonce BEFORE
                // calling getUserInfo. Require an ID token and the configured
                // issuer as well: never fall back to email-only userinfo.
                getUserInfo: async ({ idToken }) => {
                  if (!idToken) return null;
                  const claims = JSON.parse(
                    Buffer.from(idToken.split(".")[1], "base64url").toString(
                      "utf8",
                    ),
                  ) as Record<string, unknown>;
                  const now = Date.now() / 1000;
                  if (
                    typeof claims.exp !== "number" ||
                    !Number.isFinite(claims.exp) ||
                    claims.exp <= now ||
                    typeof claims.iat !== "number" ||
                    !Number.isFinite(claims.iat) ||
                    claims.iat > now + OIDC_IAT_CLOCK_TOLERANCE_SECONDS ||
                    claims.exp <= claims.iat ||
                    claims.iss !== OIDC_ISSUER_URL ||
                    typeof claims.sub !== "string" ||
                    !/^[\x20-\x7E]{1,255}$/.test(claims.sub) ||
                    !z.email().safeParse(claims.email).success
                  )
                    return null;
                  return {
                    ...claims,
                    id: claims.sub,
                    email: claims.email as string,
                    name:
                      typeof claims.name === "string"
                        ? claims.name
                        : (claims.email as string),
                    emailVerified: claims.email_verified === true,
                    image:
                      typeof claims.picture === "string"
                        ? claims.picture
                        : undefined,
                  };
                },
                scopes: [
                  ...new Set([
                    "openid",
                    "profile",
                    "email",
                    ...OIDC_SCOPE.split(/\s+/).filter(Boolean),
                  ]),
                ],
                disableSignUp: !OIDC_AUTO_PROVISION,
                disableProviderLogout: true,
              },
            ],
          }),
        ]
      : []),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (["/oauth2/link", "/unlink-account"].includes(ctx.path)) {
        throw new APIError("FORBIDDEN", {
          message: "Account linking is disabled",
        });
      }
      // Only authorization-code redirects are supported; never accept bearer
      // ID tokens from arbitrary browsers without an initiated nonce-bound flow.
      if (
        ["/sign-in/social", "/link-social"].includes(ctx.path) &&
        ctx.body?.idToken
      ) {
        throw new APIError("FORBIDDEN", {
          message: "Use the SSO redirect flow",
        });
      }
      if (ctx.path !== "/sign-up/email") return;
      if (!PASSWORD_AUTH_ENABLED || !SIGNUP_ENABLED) {
        throw new APIError("FORBIDDEN", { message: "Signup is disabled" });
      }
      if (
        SIGNUP_CODE &&
        !signupCodeMatches(ctx.body?.signupCode, SIGNUP_CODE)
      ) {
        throw new APIError("FORBIDDEN", { message: "Invalid signup code" });
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          // Provision once, after credentials/provider identity have persisted,
          // immediately before issuing a session. Failure issues no session; a
          // later sign-in can retry. Do not duplicate this with a deferred user
          // after-hook that could fail after a session has already been created.
          // Never classify a credential-less HUMAN as a system account.
          const user = context
            ? await context.context.internalAdapter.findUserById(session.userId)
            : await prisma.authUser.findUnique({
                where: { id: session.userId },
              });
          if (!user) return false;
          const profile = await provisionAuthProfile(user);
          return profile.kind === "HUMAN";
        },
      },
    },
  },
});
