import type { User } from "@prisma/client";
import * as client from "openid-client";
import {
  OIDC_ALLOW_HTTP,
  OIDC_AUTO_PROVISION,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ENABLED,
  OIDC_ISSUER_URL,
  OIDC_REDIRECT_URI,
  OIDC_SCOPE,
} from "@/env";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { createSession } from "@/lib/session";

/**
 * OpenID Connect (SSO) support.
 *
 * Flow: GET /auth/sso/login stores a single-use {state -> nonce, PKCE verifier,
 * post-login frontend callback} record in Redis, then redirects the browser to
 * the provider's authorization endpoint. GET /auth/sso/callback redeems the
 * authorization code, resolves the user by `externalId` ("<issuer>#<sub>"),
 * creates an app session and redirects to the frontend with the session token.
 */

const STATE_TTL_SECONDS = 600; // 10 minutes to complete the provider login
const USERNAME_MAX_LENGTH = 32;
const USERNAME_MIN_LENGTH = 3;

interface OidcStateData {
  nonce: string;
  codeVerifier: string;
  /** Frontend-relative path to land on after login (already validated). */
  callback: string | null;
  /** Set for the account-link flow: attach the SSO identity to this user. */
  linkUserId?: string;
}

let configPromise: Promise<client.Configuration> | null = null;

const getOidcConfig = (): Promise<client.Configuration> => {
  if (!OIDC_ENABLED || !OIDC_ISSUER_URL || !OIDC_CLIENT_ID) {
    throw new Error("OIDC is not enabled");
  }
  if (!configPromise) {
    configPromise = client.discovery(
      new URL(OIDC_ISSUER_URL),
      OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET ? { client_secret: OIDC_CLIENT_SECRET } : undefined,
      OIDC_CLIENT_SECRET ? undefined : client.None(),
      OIDC_ALLOW_HTTP ? { execute: [client.allowInsecureRequests] } : undefined,
    );
    // Retry discovery on the next request if it fails once
    configPromise.catch(() => {
      configPromise = null;
    });
  }
  return configPromise;
};

const stateKey = (state: string): string => `oidc:state:${state}`;

/**
 * Only same-origin absolute paths are safe to redirect to after login.
 * Mirrors the frontend getSafeCallback() rules.
 */
export const sanitizeCallback = (callback: string | null): string | null => {
  // c.req.query() is already URL-decoded by Hono — do NOT decodeURIComponent
  // again: a second decode would corrupt paths containing literal "%".
  if (
    callback?.startsWith("/") &&
    !callback.startsWith("//") &&
    !callback.includes("://")
  ) {
    return callback;
  }
  return null;
};

/**
 * Stores OIDC state/nonce/PKCE verifier in Redis and returns the provider
 * authorization URL the browser should be redirected to.
 */
export const buildSsoAuthorizationUrl = async (
  callback: string | null,
  linkUserId?: string,
): Promise<URL> => {
  const config = await getOidcConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const redis = await getRedisClient();
  const data: OidcStateData = {
    nonce,
    codeVerifier,
    callback: sanitizeCallback(callback),
    linkUserId,
  };
  await redis.setEx(stateKey(state), STATE_TTL_SECONDS, JSON.stringify(data));

  return client.buildAuthorizationUrl(config, {
    redirect_uri: OIDC_REDIRECT_URI as string,
    scope: OIDC_SCOPE,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
};

const consumeState = async (state: string): Promise<OidcStateData | null> => {
  const redis = await getRedisClient();
  // Single-use: read and delete atomically
  const raw = await redis.getDel(stateKey(state));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as OidcStateData;
};

export interface SsoCallbackResult {
  token: string;
  callback: string | null;
}

/**
 * Exchanges the authorization code carried by `requestUrl` (the incoming
 * callback request) for tokens, validates them, and resolves the local user.
 * Returns the app session token to hand to the frontend.
 */
export const handleSsoCallback = async (
  requestUrl: string,
): Promise<SsoCallbackResult> => {
  const config = await getOidcConfig();

  const incoming = new URL(requestUrl);
  const state = incoming.searchParams.get("state");
  if (!state) {
    throw new Error("Missing state parameter");
  }
  const stored = await consumeState(state);
  if (!stored) {
    throw new Error("Invalid or expired state parameter");
  }

  // The token endpoint requires redirect_uri equal to the registered value;
  // rebuild it from config (the incoming request may carry an internal host)
  // and copy the authorization response parameters onto it.
  const callbackUrl = new URL(OIDC_REDIRECT_URI as string);
  callbackUrl.search = incoming.search;

  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: stored.codeVerifier,
    expectedState: state,
    expectedNonce: stored.nonce,
  });

  const claims = tokens.claims();
  if (!claims?.sub) {
    throw new Error("ID token is missing the sub claim");
  }

  const externalId = `${claims.iss}#${claims.sub}`;
  const user = stored.linkUserId
    ? await linkOidcUser(stored.linkUserId, externalId)
    : await findOrProvisionOidcUser(externalId, claims);
  if (!user) {
    throw new OidcUserNotProvisionedError();
  }

  const token = await createSession(user.id);
  return { token, callback: stored.callback };
};

/**
 * Account-link flow: attach an SSO identity to an already-authenticated
 * local account so the user can migrate off password login.
 */
const linkOidcUser = async (
  userId: string,
  externalId: string,
): Promise<User> => {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new Error("Link target account no longer exists");
  }
  if (target.externalId && target.externalId !== externalId) {
    throw new OidcLinkConflictError();
  }
  const conflict = await prisma.user.findUnique({ where: { externalId } });
  if (conflict && conflict.id !== target.id) {
    throw new OidcLinkConflictError();
  }
  if (conflict) {
    // Already linked to this same identity — idempotent success
    return conflict;
  }
  return prisma.user.update({
    where: { id: userId },
    data: { externalId },
  });
};

export class OidcLinkConflictError extends Error {
  constructor() {
    super(
      "This SSO identity is already linked to another account, or this " +
        "account is already linked to a different SSO identity",
    );
    this.name = "OidcLinkConflictError";
  }
}

export class OidcUserNotProvisionedError extends Error {
  constructor() {
    super("No user account is linked to this SSO identity");
    this.name = "OidcUserNotProvisionedError";
  }
}

const findOrProvisionOidcUser = async (
  externalId: string,
  claims: client.IDToken,
): Promise<User | null> => {
  const existing = await prisma.user.findUnique({ where: { externalId } });
  if (existing) {
    return existing;
  }
  if (!OIDC_AUTO_PROVISION) {
    return null;
  }

  const base = usernameBase(claims);
  for (let attempt = 0; attempt < 5; attempt++) {
    const username =
      attempt === 0
        ? base
        : `${base.slice(0, USERNAME_MAX_LENGTH - 6)}_${client.randomState().slice(0, 4)}`;
    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken) {
      continue;
    }
    try {
      return await prisma.user.create({
        data: {
          username,
          name:
            typeof claims.name === "string" && claims.name
              ? claims.name
              : username,
          externalId,
          password: null,
          role: "USER",
        },
      });
    } catch {
      // A concurrent first login for the same identity may have won the
      // unique-externalId race — resolve to it instead of failing.
      const winner = await prisma.user.findUnique({ where: { externalId } });
      if (winner) {
        return winner;
      }
      // Otherwise the collision was the username — retry with a suffix.
    }
  }
  throw new Error("Failed to generate a unique username for the SSO user");
};

/**
 * Derives a login-name base from ID token claims, constrained to the same
 * rules as password-signup usernames: [a-zA-Z0-9_-], 3-32 chars.
 */
const usernameBase = (claims: client.IDToken): string => {
  const candidates = [
    typeof claims.preferred_username === "string"
      ? claims.preferred_username
      : null,
    typeof claims.email === "string" ? claims.email.split("@")[0] : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const sanitized = candidate
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, USERNAME_MAX_LENGTH);
    if (sanitized.length >= USERNAME_MIN_LENGTH) {
      return sanitized;
    }
  }
  return `user_${claims.sub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8)}`;
};
