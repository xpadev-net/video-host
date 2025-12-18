import { zValidator } from "@hono/zod-validator";
import type { User } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

type Env = {
  Variables: {
    user?: User;
  };
};

const CreateSystemAccountSchema = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
});

const app = new Hono<Env>();

export const systemAccountsRoute = app
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user || user.role !== "ADMIN") {
      return unauthorized(c, "Admin access required");
    }

    const systemAccounts = await prisma.user.findMany({
      where: {
        password: null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return ok(c, systemAccounts);
  })
  .post("/", zValidator("json", CreateSystemAccountSchema), async (c) => {
    const user = c.get("user");
    if (!user || user.role !== "ADMIN") {
      return unauthorized(c, "Admin access required");
    }

    const { username, name } = c.req.valid("json");

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      return badRequest(c, "Username already exists");
    }

    const systemAccount = await prisma.user.create({
      data: {
        username,
        name,
        password: null, // System account has no password
      },
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return ok(c, systemAccount);
  })
  .delete("/:id", async (c) => {
    const user = c.get("user");
    if (!user || user.role !== "ADMIN") {
      return unauthorized(c, "Admin access required");
    }

    const id = c.req.param("id");
    if (!id) {
      return badRequest(c, "No id provided");
    }

    const systemAccount = await prisma.user.findUnique({
      where: { id },
    });

    if (!systemAccount) {
      return badRequest(c, "System account not found");
    }

    if (systemAccount.password !== null) {
      return badRequest(c, "Cannot delete a regular user account");
    }

    // Delete associated data
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.movieOnPlaylist.deleteMany({
      where: {
        playlist: { authorId: id },
      },
    });
    await prisma.playlist.deleteMany({ where: { authorId: id } });
    await prisma.movieVariant.deleteMany({
      where: {
        movie: { authorId: id },
      },
    });
    await prisma.movie.deleteMany({ where: { authorId: id } });
    await prisma.series.deleteMany({ where: { authorId: id } });
    await prisma.user.delete({ where: { id } });

    return ok(c, { success: true });
  });

export const registerSystemAccountsRoute = (app: HonoApp) => {
  app.route("/system-accounts", systemAccountsRoute);
};
