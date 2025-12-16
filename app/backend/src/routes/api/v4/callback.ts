import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { CALLBACK_SECRET } from "@/env";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerCallbackRoute = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerEncodeCompleteRoute(api);
  app.route("/callback", api);
};

const EncodeCompleteSchema = z.object({
  movieId: z.string(),
  variantId: z.string().optional(), // Optional: if provided, updates specific variant
  status: z.enum(["success", "failed"]),
  s3Key: z.string().optional(),
  contentUrl: z.string().optional(), // The final content URL for streaming
  duration: z.number().optional(),
  thumbnailUrl: z.string().optional(),
});

const registerEncodeCompleteRoute = (app: HonoApp) => {
  app.post(
    "/encode-complete",
    zValidator("json", EncodeCompleteSchema),
    async (c) => {
      // Verify callback secret
      const authHeader = c.req.header("Authorization");
      const expectedAuth = `Bearer ${CALLBACK_SECRET}`;
      if (authHeader !== expectedAuth) {
        return unauthorized(c, "Invalid callback secret");
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
        return badRequest(c, "Movie not found");
      }

      // Find the variant to update (by variantId or the first PROCESSING one)
      const targetVariant = variantId
        ? movie.variants.find((v) => v.variantId === variantId)
        : movie.variants.find((v) => v.status === "PROCESSING");

      if (!targetVariant) {
        return badRequest(c, "No matching variant found");
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
};
