import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { CALLBACK_SECRET } from "@/env";
import { prisma } from "@/lib/prisma";
import { HttpUrlSchema } from "@/utils/inputSchemas";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { safeEqual } from "@/utils/safeEqual";

const EncodeCompleteSchema = z.object({
  movieId: z.string(),
  variantId: z.string().min(1).max(191).optional(),
  status: z.enum(["success", "failed"]),
  s3Key: z.string().min(1).max(512).optional(),
  contentUrl: HttpUrlSchema.optional(), // The final content URL for streaming
  duration: z.number().int().nonnegative().max(2_147_483_647).optional(),
  thumbnailUrl: HttpUrlSchema.optional(),
});

const app = new Hono<Env>();

export const callbackRoute = app.post(
  "/",
  zValidator("json", EncodeCompleteSchema),
  async (c) => {
    // Verify callback secret
    const authHeader = c.req.header("Authorization");
    const expectedAuth = `Bearer ${CALLBACK_SECRET}`;
    if (!authHeader || !safeEqual(authHeader, expectedAuth)) {
      unauthorized("Invalid callback secret");
    }

    const {
      movieId,
      variantId,
      status,
      s3Key,
      contentUrl,
      duration,
      thumbnailUrl,
    } = c.req.valid("json");

    await prisma.$transaction(async (tx) => {
      const movie = await tx.movie.findUnique({
        where: { id: movieId },
        select: { id: true },
      });
      if (!movie) badRequest("Movie not found");
      if (!variantId || !s3Key) {
        badRequest("variantId and s3Key are required");
      }

      const targetVariant = await tx.movieVariant.findFirst({
        where: { movieId, variantId },
        select: { id: true },
      });

      if (!targetVariant) badRequest("No matching variant found");

      // Only the job that still owns this processing key may change state.
      const updated = await tx.movieVariant.updateMany({
        where: {
          id: targetVariant.id,
          status: "PROCESSING",
          s3Key,
        },
        data:
          status === "success"
            ? {
                status: "READY",
                ...(contentUrl === undefined ? {} : { contentUrl }),
              }
            : { status: "FAILED" },
      });

      if (updated.count !== 1) {
        throw new HTTPException(409, {
          message: "Callback does not match the active processing job",
        });
      }

      if (
        status === "success" &&
        (duration !== undefined || thumbnailUrl !== undefined)
      ) {
        await tx.movie.update({
          where: { id: movieId },
          data: {
            ...(duration === undefined ? {} : { duration }),
            ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
          },
        });
      }
    });

    return ok(c, { success: true });
  },
);

export const registerCallbackRoute = (app: HonoApp) => {
  app.route("/callback", callbackRoute);
};
