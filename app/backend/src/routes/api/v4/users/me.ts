import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterSelf } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { AvatarUrlSchema, NameSchema } from "@/utils/inputSchemas";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

export const meRoute = app
  .get("/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    return ok(c, filterSelf(user));
  })
  .patch(
    "/me",
    zValidator(
      "json",
      z.object({
        name: NameSchema.optional(),
        avatarUrl: AvatarUrlSchema.nullable().optional(),
      }),
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        unauthorized("Unauthorized");
      }
      const data = c.req.valid("json");
      if (!data) {
        badRequest("Invalid data");
      }
      const updatedUser = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          name: data.name === undefined ? user.name : data.name,
          avatarUrl:
            data.avatarUrl === undefined ? user.avatarUrl : data.avatarUrl,
        },
      });
      return ok(c, filterSelf(updatedUser));
    },
  );

export const registerUsersMeRoute = (app: HonoApp) => {
  app.route("/", meRoute);
};
