import { createMiddleware } from "hono/factory";
import type { Env, HonoApp } from "@/@types/hono";
import { AUTH_TRUSTED_ORIGINS, PUBLIC_ENDPOINTS } from "@/env";
import { auth } from "@/lib/auth";
import { isPathWithin, isTrustedMutationOrigin } from "@/lib/auth-policy";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/utils/response";

export const handleAuth = (app: HonoApp) => {
  app.use("/*", authMiddleware);
};

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // Better Auth validates its own cookies, origin, OAuth state, nonce and PKCE.
  // Machine endpoints retain their separate, secret-validated authentication.
  if (
    isPathWithin(path, "/api/auth") ||
    isPathWithin(path, "/api/v4/callback") ||
    isPathWithin(path, "/api/v4/vod") ||
    path === "/healthz" ||
    c.req.method === "OPTIONS"
  ) {
    await next();
    return;
  }

  if (!["GET", "HEAD"].includes(c.req.method)) {
    // CORS alone does not prevent simple cross-site form submissions. Every
    // browser mutation must carry an exact configured trusted Origin.
    if (
      !isTrustedMutationOrigin(c.req.header("origin"), AUTH_TRUSTED_ORIGINS)
    ) {
      forbidden("Untrusted request origin");
    }
  }

  const { response: session, headers } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    c.header("Set-Cookie", cookie, { append: true });
  }
  if (session) {
    const user = await prisma.user.findUnique({
      where: { authUserId: session.user.id },
    });
    if (user?.kind === "HUMAN") {
      c.set("user", user);
      c.header("Cache-Control", "private, no-store");
    }
  }
  if (!c.get("user") && !isPublicEndpoint(path)) unauthorized("Unauthorized");
  await next();
});

function isPublicEndpoint(path: string): boolean {
  // Authentication runs before trailing-slash redirects. Allow only this
  // exact alias so anonymous clients can reach the canonical config route.
  if (path === "/api/v4/auth/config" || path === "/api/v4/auth/config/") {
    return true;
  }
  return PUBLIC_ENDPOINTS.some((prefix) => isPathWithin(path, prefix));
}
