import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { isPasswordValid } from "@/lib/password";
import { prisma } from "@/lib/prisma";
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

export const registerAuthRoute = (app: HonoApp) => {
  app.post("/auth", zValidator("json", authSchema), async (c) => {
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
        return unauthorized(c, "Invalid token");
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
    if (!user || !user.password) {
      return unauthorized(c, "Invalid username or password");
    }
    if (!(await isPasswordValid(password, user.password))) {
      return unauthorized(c, "Invalid username or password");
    }
    const token = await createSession(user.id);
    return ok(c, token);
  });

  app.delete("/auth", zValidator("json", tokenAuthSchema), async (c) => {
    const token = c.req.valid("json").token;
    if (!token) {
      return unauthorized(c, "Not logged in");
    }
    await prisma.session.deleteMany({
      where: {
        token,
      },
    });
    return ok(c, null);
  });
};
