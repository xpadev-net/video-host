import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { isPasswordValid } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { authRateLimiter } from "@/lib/rateLimiter";
import { createSession } from "@/lib/session";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const passwordAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
  type: z.literal("password").optional().default("password"),
});

const tokenAuthSchema = z.object({
  token: z.string(),
  type: z.literal("token").optional().default("token"),
});

const authSchema = z.union([passwordAuthSchema, tokenAuthSchema]);

const app = new Hono<Env>();

export const authRoute = app
  .post("/", authRateLimiter, zValidator("json", authSchema), async (c) => {
    const data = c.req.valid("json");
    if (data.type === "token") {
      const { token } = data;
      const session = await prisma.session.findFirst({
        where: {
          token,
          expiredAt: {
            gte: new Date(),
          },
        },
      });
      if (!session) {
        unauthorized("Invalid token");
      }
      const newToken = await createSession(session.userId);
      return ok(c, newToken);
    }
    const { username, password } = data;
    const user = await prisma.user.findFirst({
      where: {
        username,
        password: {
          not: null,
        },
      },
    });
    if (!user?.password) {
      unauthorized("Invalid username or password");
    }
    if (!(await isPasswordValid(password, user.password))) {
      unauthorized("Invalid username or password");
    }
    const token = await createSession(user.id);
    return ok(c, token);
  })
  .delete("/", zValidator("json", tokenAuthSchema), async (c) => {
    const token = c.req.valid("json").token;
    if (!token) {
      unauthorized("Not logged in");
    }
    await prisma.session.deleteMany({
      where: {
        token,
      },
    });
    return ok(c, null);
  });

export const registerAuthRoute = (app: HonoApp) => {
  app.route("/auth", authRoute);
};
