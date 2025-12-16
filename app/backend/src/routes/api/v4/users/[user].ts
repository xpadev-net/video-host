import type { HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerUsersDetailsRoute = (app: HonoApp) => {
  app.get("/:user", async (c) => {
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
};
