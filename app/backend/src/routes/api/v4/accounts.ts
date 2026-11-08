import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { NameSchema, UsernameSchema } from "@/utils/inputSchemas";
import { badRequest, forbidden, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();
export const accountsRoute = app
  .get("/me", (c) => {
    const account = c.get("account");
    if (!account) unauthorized("Unauthorized");
    return ok(c, account);
  })
  .use("*", async (c, next) => {
    const user = c.get("account");
    if (!user) unauthorized("Unauthorized");
    if (user.role !== "ADMIN") forbidden("Admin access required");
    await next();
  })
  .get("/", async (c) =>
    ok(
      c,
      await prisma.authUser.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          createdAt: true,
          profiles: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
  )
  .post(
    "/",
    zValidator(
      "json",
      z.object({ name: NameSchema, username: UsernameSchema }),
    ),
    async (c) => {
      const { name, username } = c.req.valid("json");
      try {
        const account = await prisma.authUser.create({
          data: {
            id: crypto.randomUUID(),
            name,
            profiles: { create: { name, username } },
          },
          select: {
            id: true,
            name: true,
            role: true,
            createdAt: true,
            profiles: { select: { id: true, name: true, username: true } },
          },
        });
        return ok(c, account);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          badRequest("Username already exists");
        throw error;
      }
    },
  )
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (id === c.get("authUserId"))
      badRequest("Cannot delete your own account");
    try {
      await prisma.$transaction(async (tx) => {
        // Owned content restricts deletion; a failed transaction preserves all profiles.
        await tx.user.deleteMany({ where: { accountId: id } });
        await tx.authUser.delete({ where: { id } });
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2003"
      )
        badRequest("Remove owned content before deleting the account");
      throw error;
    }
    return ok(c, { success: true });
  });
