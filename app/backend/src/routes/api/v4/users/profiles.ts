import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import {
  MAX_ADDITIONAL_PROFILES,
  NameSchema,
  UsernameSchema,
} from "@/utils/inputSchemas";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();
const CreateProfileSchema = z.object({
  name: NameSchema,
  username: UsernameSchema,
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

    let profile: Awaited<ReturnType<typeof prisma.user.create>>;
    try {
      profile = await prisma.$transaction(
        async (tx) => {
          const additionalProfileCount = await tx.authProfile.count({
            where: { authUserId },
          });
          if (additionalProfileCount >= MAX_ADDITIONAL_PROFILES) {
            badRequest(
              `An account can have at most ${MAX_ADDITIONAL_PROFILES} additional profiles`,
            );
          }
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
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        badRequest("Username already exists");
      }
      throw error;
    }
    return ok(c, { ...filterUser(profile), isDefault: false });
  });

export const registerProfilesRoute = (app: HonoApp) => {
  app.route("/", profilesRoute);
};
