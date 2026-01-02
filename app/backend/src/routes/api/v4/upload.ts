import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { generateUploadKey, getPresignedUploadUrl } from "@/lib/s3";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const PresignedUrlSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

const app = new Hono<Env>();

export const uploadRoute = app.post(
  "/presigned-url",
  zValidator("json", PresignedUrlSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const { filename, contentType } = c.req.valid("json");
    const key = generateUploadKey(user.id, filename);
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return ok(c, {
      uploadUrl,
      key,
    });
  },
);

export const registerUploadRoute = (app: HonoApp) => {
  app.route("/upload", uploadRoute);
};
