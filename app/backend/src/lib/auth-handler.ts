import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import type { Env } from "@/@types/hono";
import { AUTH_TRUSTED_PROXY_CIDRS } from "@/env";
import { auth } from "@/lib/auth";
import { createTrustedProxyList, requestWithClientIp } from "@/lib/client-ip";

const trusted = createTrustedProxyList(AUTH_TRUSTED_PROXY_CIDRS);

export function handleAuthRequest(c: Context<Env>) {
  let request: Request;
  try {
    request = requestWithClientIp(
      c.req.raw,
      getConnInfo(c).remote.address,
      trusted,
    );
  } catch {
    // Never silently collapse all users into a shared fallback bucket when
    // the runtime or configured proxy chain cannot establish a client IP.
    return c.json(
      { message: "Authentication proxy configuration is unavailable" },
      503,
    );
  }
  return auth.handler(request);
}
