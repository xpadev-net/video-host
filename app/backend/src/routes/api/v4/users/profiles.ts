import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();
const CreateProfileSchema = z.object({
  name: z.string().trim().min(1).max(191),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/),
});

export const profilesRoute = app
  .get("/", async (c) => {
    const authUserId = c.get("authUserId");
    if (!authUserId) unauthorized("Unauthorized");
    const account = await prisma.authUser.findUnique({
      where: { id: authUserId },
      include: {
        profile: true,
        additionalProfiles: { include: { profile: true } },
      },
    });
    if (!account?.profile) unauthorized("Profile not provisioned");
    const profiles = [
      { ...filterUser(account.profile), isDefault: true },
      ...account.additionalProfiles.map((membership) => ({
        ...filterUser(membership.profile),
        isDefault: false,
      })),
    ];
    return ok(c, profiles);
  })
  .post("/", zValidator("json", CreateProfileSchema), async (c) => {
    const authUserId = c.get("authUserId");
    if (!authUserId) unauthorized("Unauthorized");
    const { name, username } = c.req.valid("json");
    const duplicate = await prisma.user.findUnique({ where: { username } });
    if (duplicate) badRequest("Username already exists");
    const account = await prisma.authUser.findUnique({
      where: { id: authUserId },
      include: { profile: true },
    });
    if (!account?.profile) unauthorized("Profile not provisioned");

    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          username,
          kind: "HUMAN",
          role: account.profile?.role ?? "USER",
        },
      });
      await tx.authProfile.create({
        data: { authUserId, profileId: created.id },
      });
      return created;
    });
    return ok(c, { ...filterUser(profile), isDefault: false });
  });

export const registerProfilesRoute = (app: HonoApp) => {
  app.route("/", profilesRoute);
};
