import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

export const userRoute = app.get("/:user", async (c) => {
  const userId = c.req.param("user");
  if (!userId) {
    badRequest("No user provided");
  }
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!user) {
    notFound("User not found");
  }
  return ok(c, filterUser(user));
});

export const registerUsersDetailsRoute = (app: HonoApp) => {
  app.route("/", userRoute);
};
