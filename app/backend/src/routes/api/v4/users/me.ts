import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterSelf } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { AvatarUrlSchema, NameSchema } from "@/utils/inputSchemas";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

const MePatchSchema = z.object({
  name: NameSchema.optional(),
  avatarUrl: AvatarUrlSchema.nullable().optional(),
  visibility: ZVisibility.optional(),
});

export const meRoute = app
  .get("/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    // Re-fetch with the viewer membership so the owner can read and edit the
    // profiles allowed to see them.
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profileViewers: { include: { user: true } } },
    });
    if (!profile) {
      unauthorized("Profile not provisioned");
    }
    return ok(c, filterSelf({ ...profile, role: user.role }));
  })
  .patch("/me", zValidator("json", MePatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const data = c.req.valid("json");
    if (!data) {
      badRequest("Invalid data");
    }

    const { visibility } = data;
    // The account's default profile is always public; only additional
    // profiles may be made non-public. Viewer grants happen via invitations.
    if (visibility !== undefined && user.authUserId) {
      badRequest("The default profile is always public");
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        name: data.name === undefined ? user.name : data.name,
        avatarUrl:
          data.avatarUrl === undefined ? user.avatarUrl : data.avatarUrl,
        visibility: user.authUserId
          ? undefined
          : (visibility ?? user.visibility),
      },
      include: { profileViewers: { include: { user: true } } },
    });
    return ok(c, filterSelf({ ...updatedUser, role: user.role }));
  });

export const registerUsersMeRoute = (app: HonoApp) => {
  app.route("/", meRoute);
};
