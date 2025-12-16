import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerSystemAccountsRoute = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerGetRoute(api);
  registerPostRoute(api);
  registerDeleteRoute(api);
  app.route("/system-accounts", api);
};

// GET /api/v4/system-accounts - List all system accounts (admin only)
const registerGetRoute = (app: HonoApp) => {
  app.get("/", async (c) => {
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
  });
};

const CreateSystemAccountSchema = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
});

// POST /api/v4/system-accounts - Create a system account (admin only)
const registerPostRoute = (app: HonoApp) => {
  app.post("/", zValidator("json", CreateSystemAccountSchema), async (c) => {
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
  });
};

// DELETE /api/v4/system-accounts/:id - Delete a system account (admin only)
const registerDeleteRoute = (app: HonoApp) => {
  app.delete("/:id", async (c) => {
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
};
