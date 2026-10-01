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
