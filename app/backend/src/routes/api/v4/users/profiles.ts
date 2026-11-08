import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterSelf } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import {
  MAX_PROFILES_PER_ACCOUNT,
  NameSchema,
  UsernameSchema,
} from "@/utils/inputSchemas";
import { badRequest, forbidden, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();
const AccountQuery = z.object({ accountId: z.string().optional() });
async function authorizeAccount(
  authUserId: string | undefined,
  role: string | undefined,
  requested?: string,
) {
  if (!authUserId) unauthorized("Unauthorized");
  if (requested && requested !== authUserId && role !== "ADMIN")
    forbidden("Admin access required");
  return requested || authUserId;
}
export const profilesRoute = app
  .get("/", zValidator("query", AccountQuery), async (c) => {
    const accountId = await authorizeAccount(
      c.get("authUserId"),
      c.get("account")?.role,
      c.req.valid("query").accountId,
    );
    const profiles = await prisma.user.findMany({
      where: { accountId },
      include: { profileViewers: { include: { user: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return ok(c, profiles.map(filterSelf));
  })
  .post(
    "/",
    zValidator(
      "json",
      z.object({
        name: NameSchema,
        username: UsernameSchema,
        accountId: z.string().optional(),
      }),
    ),
    async (c) => {
      const { name, username, accountId: requested } = c.req.valid("json");
      const accountId = await authorizeAccount(
        c.get("authUserId"),
        c.get("account")?.role,
        requested,
      );
      let profile: Awaited<ReturnType<typeof prisma.user.create>> | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          profile = await prisma.$transaction(
            async (tx) => {
              const count = await tx.user.count({ where: { accountId } });
              if (count >= MAX_PROFILES_PER_ACCOUNT)
                badRequest("Profile limit reached");
              return tx.user.create({ data: { name, username, accountId } });
            },
            { isolationLevel: "Serializable" },
          );
          break;
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined;
          if (code === "P2002") badRequest("Username already exists");
          if (code !== "P2034" || attempt === 2) throw error;
        }
      }
      if (!profile) throw new Error("Profile creation failed");
      return ok(c, filterSelf(profile));
    },
  );
export const registerProfilesRoute = (app: HonoApp) => {
  app.route("/", profilesRoute);
};
