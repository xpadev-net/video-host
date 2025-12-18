import type { User } from "@prisma/client";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/utils/response";
import { ok } from "@/utils/response/ok";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

export const userRoute = app.get("/:user", async (c) => {
  const userId = c.req.param("user");
  if (!userId) {
    return badRequest(c, "No user provided");
  }
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!user) {
    return notFound(c, "User not found");
  }
  return ok(c, filterUser(user));
});

export const registerUsersDetailsRoute = (app: HonoApp) => {
  app.route("/", userRoute);
};
