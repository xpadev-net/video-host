import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import type { HonoApp } from "@/@types/hono";
import { JWT_SECRET, PUBLIC_ENDPOINTS } from "@/env";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/utils/response";

export const handleAuth = (app: HonoApp) => {
  app.use("/*", authMiddleware);
};

const authMiddleware = createMiddleware<{
  Variables: {
    user: {
      id: string;
      username: string;
      name: string;
    };
  };
}>(async (c, next) => {
  const url = new URL(c.req.url).pathname;
  const authHeader = c.req.header("authorization");
  const token = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    if (isPublicEndpoint(url)) {
      await next();
      return;
    }
    return unauthorized(c, "Unauthorized");
  }

  // JWT signature verification (before DB query to reject invalid tokens early)
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    if (isPublicEndpoint(url)) {
      await next();
      return;
    }
    return unauthorized(c, "Invalid token signature");
  }

  const session = await prisma.session.findFirst({
    where: {
      token,
      expiredAt: {
        gte: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
  if (!session) {
    if (isPublicEndpoint(url)) {
      await next();
      return;
    }
    return unauthorized(c, "Unauthorized");
  }
  c.set("user", session.user);
  await next();
});

const isPublicEndpoint = (url: string) => {
  // Callback endpoint has its own secret-based auth
  if (url.startsWith("/api/v4/callback")) {
    return true;
  }
  // VOD mapping endpoint is called by nginx internally
  if (url.startsWith("/api/v4/vod")) {
    return true;
  }
  for (const publicPath of PUBLIC_ENDPOINTS) {
    if (url.startsWith(publicPath)) {
      return true;
    }
  }
  return false;
};
