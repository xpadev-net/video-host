import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
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
  variantId: z.string().max(191).optional(), // Optional: if provided, updates specific variant
  status: z.enum(["success", "failed"]),
  s3Key: z.string().max(512).optional(),
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

    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      include: { variants: true },
    });

    if (!movie) {
      badRequest("Movie not found");
    }

    // Find the variant to update (by variantId or the first PROCESSING one)
    const targetVariant = variantId
      ? movie.variants.find((v) => v.variantId === variantId)
      : movie.variants.find((v) => v.status === "PROCESSING");

    if (!targetVariant) {
      badRequest("No matching variant found");
    }

    if (status === "success") {
      // Update the variant
      await prisma.movieVariant.update({
        where: { id: targetVariant.id },
        data: {
          status: "READY",
          s3Key: s3Key ?? targetVariant.s3Key,
          contentUrl: contentUrl ?? targetVariant.contentUrl,
        },
      });

      // Update movie duration and thumbnail if provided
      if (duration !== undefined || thumbnailUrl) {
        await prisma.movie.update({
          where: { id: movieId },
          data: {
            duration: duration ?? movie.duration,
            thumbnailUrl: thumbnailUrl ?? movie.thumbnailUrl,
          },
        });
      }
    } else {
      // Mark variant as failed
      await prisma.movieVariant.update({
        where: { id: targetVariant.id },
        data: {
          status: "FAILED",
        },
      });
    }

    return ok(c, { success: true });
  },
);

export const registerCallbackRoute = (app: HonoApp) => {
  app.route("/callback", callbackRoute);
};
