import { createHash, timingSafeEqual } from "node:crypto";

export function oidcProviderId(issuer: string): string {
  // Issuer changes must never reuse a previous provider's subject namespace.
  return `oidc-${createHash("sha256").update(issuer).digest("hex").slice(0, 32)}`;
}

/** Encode the exact, case-sensitive OIDC subject into a MySQL-collation-safe key. */
export function oidcAccountId(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

export function signupCodeMatches(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function isPathWithin(path: string, prefix: string): boolean {
  const normalized = prefix.replace(/\/+$/, "");
  return path === normalized || path.startsWith(`${normalized}/`);
}

/** Missing, null, malformed and wildcard origins must fail closed. */
export function isTrustedMutationOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (!origin || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && trustedOrigins.includes(origin);
  } catch {
    return false;
  }
}

/** `https://idp.example/` and `https://idp.example` name the same issuer. */
export function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/+$/, "");
}

export function oidcIssuerMatches(claim: unknown, configured: string): boolean {
  return (
    typeof claim === "string" &&
    normalizeIssuer(claim) === normalizeIssuer(configured)
  );
}

/** Payload of a JWT whose signature was already verified; null if malformed. */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return claims && typeof claims === "object" && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Only plain http(s) URLs are acceptable avatar images (fits VARCHAR(191)). */
export function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 191) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}
