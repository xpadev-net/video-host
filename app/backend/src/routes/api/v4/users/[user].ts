import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { canViewProfile } from "@/utils/buildVisibilityFilter";
import { badRequest, notFound } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

export const userRoute = app.get("/:user", async (c) => {
  const userId = c.req.param("user");
  if (!userId) {
    badRequest("No user provided");
  }
  const user = c.get("user");
  const target = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      profileViewers: { select: { userId: true } },
    },
  });
  if (!target) {
    notFound("User not found");
  }
  // Profiles respect the same visibility model as movies: a requester who may
  // not see the profile gets a 404 rather than a hint the profile exists.
  if (!canViewProfile(target, user)) {
    notFound("User not found");
  }
  return ok(c, filterUser(target));
});

export const registerUsersDetailsRoute = (app: HonoApp) => {
  app.route("/", userRoute);
};
