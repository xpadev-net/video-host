import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

export const meRoute = app
  .get("/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    return ok(c, filterUser(user));
  })
  .patch(
    "/me",
    zValidator(
      "json",
      z.object({
        name: z.string().optional(),
        avatarUrl: z.string().optional(),
      }),
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return unauthorized(c, "Unauthorized");
      }
      const data = c.req.valid("json");
      if (!data) {
        return badRequest(c, "Invalid data");
      }
      const updatedUser = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          name: data.name ?? user.name,
          avatarUrl: data.avatarUrl ?? user.avatarUrl,
        },
      });
      return ok(c, filterUser(updatedUser));
    },
  );

export const registerUsersMeRoute = (app: HonoApp) => {
  app.route("/", meRoute);
};
