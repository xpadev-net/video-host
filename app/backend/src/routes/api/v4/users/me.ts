import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerUsersMeRoute = (app: HonoApp) => {
  registerGet(app);
  registerPatch(app);
};

const registerGet = (app: HonoApp) => {
  app.get("/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      return ok(c, null);
    }
    return ok(c, filterUser(user));
  });
};

const PatchSchema = z.object({
  name: z.string(),
});

const registerPatch = (app: HonoApp) => {
  app.patch("/me", zValidator("json", PatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Not logged in");
    }
    const { name } = c.req.valid("json");
    const newUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        name,
      },
    });
    return ok(c, newUser);
  });
};
