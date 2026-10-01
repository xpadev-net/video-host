import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { filterMovie } from "@/lib/filter";
import { formatMovie } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { addEncodeJob, setEncodeProgress } from "@/lib/redis";
import {
  generateUploadKey,
  getPresignedUploadUrl,
  tmpFileExists,
} from "@/lib/s3";
import { canManageMovie, resolveAuthorId } from "@/utils/movieAuth";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const PresignedUrlSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

const InitUploadSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  title: z.string().optional(),
  asUserId: z.string().optional(), // Admin only
});

const RetryUploadSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

const titleFromFilename = (filename: string): string => {
  const stem = filename.replace(/\.[^/.]+$/, "");
  return stem || filename;
};

const app = new Hono<Env>();

export const uploadRoute = app
  .post("/presigned-url", zValidator("json", PresignedUrlSchema), async (c) => {
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
  })
  // Create the movie record as soon as a file is picked, before the upload
  // itself starts, so metadata can be edited while the file uploads and the
  // encode runs (YouTube-style upload flow). The variant stays UPLOADING and
  // no encode job is queued until /:movieId/complete is called after the file
  // has fully landed in S3. Movies start PRIVATE; the chosen visibility is
  // applied by patching the movie afterwards.
  .post("/init", zValidator("json", InitUploadSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const { filename, contentType, title, asUserId } = c.req.valid("json");
    const authorId = await resolveAuthorId(user, asUserId);
    const key = generateUploadKey(authorId, filename);

    const movie = await prisma.movie.create({
      data: {
        title: title?.trim() || titleFromFilename(filename),
        authorId,
        visibility: "PRIVATE",
        variants: {
          create: {
            variantId: "original",
            contentUrl: "", // Will be set after encoding
            s3Key: key,
            status: "UPLOADING",
          },
        },
      },
      include: {
        author: true,
        variants: true,
      },
    });

    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return ok(c, {
      movie: formatMovie(filterMovie(movie)),
      uploadUrl,
      key,
    });
  })
  // Issue a fresh presigned URL for a movie still awaiting its upload, e.g.
  // to retry a failed upload or resume one abandoned mid-way. A new s3Key is
  // generated each time so a stale partial object is never reused.
  .post("/:movieId/url", zValidator("json", RetryUploadSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const movie = await prisma.movie.findUnique({
      where: { id: c.req.param("movieId") },
      include: { variants: true },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    if (!(await canManageMovie(user, movie.authorId))) {
      unauthorized("Not authorized to upload to this movie");
    }

    const variant = movie.variants.find((v) => v.status === "UPLOADING");
    if (!variant) {
      badRequest("Movie is not awaiting upload");
    }

    const { filename, contentType } = c.req.valid("json");
    const key = generateUploadKey(movie.authorId, filename);
    await prisma.movieVariant.update({
      where: { id: variant.id },
      data: { s3Key: key },
    });

    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return ok(c, {
      uploadUrl,
      key,
    });
  })
  // Mark the upload as finished and queue encoding. Idempotent: if the
  // variant already advanced past UPLOADING the job was already queued, so
  // this just reports success. The object must exist in S3, otherwise a
  // premature complete would feed the encoder a missing file.
  .post("/:movieId/complete", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const movie = await prisma.movie.findUnique({
      where: { id: c.req.param("movieId") },
      include: { variants: true },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    if (!(await canManageMovie(user, movie.authorId))) {
      unauthorized("Not authorized to complete this upload");
    }

    const variant = movie.variants.find((v) => v.status === "UPLOADING");
    if (!variant) {
      // Already completed (or failed): nothing left to queue.
      return ok(c, { success: true });
    }

    if (!variant.s3Key || !(await tmpFileExists(variant.s3Key))) {
      badRequest("Upload has not finished yet");
    }

    // Claim the transition atomically so a duplicate request can't queue a
    // second encode job for the same movie.
    const updated = await prisma.movieVariant.updateMany({
      where: { id: variant.id, status: "UPLOADING" },
      data: { status: "PROCESSING" },
    });
    if (updated.count === 0) {
      return ok(c, { success: true });
    }

    await addEncodeJob({
      movieId: movie.id,
      s3Key: variant.s3Key,
      userId: movie.authorId,
      createdAt: new Date().toISOString(),
    });
    await setEncodeProgress(movie.id, { status: "queued" });

    return ok(c, { success: true });
  });

export const registerUploadRoute = (app: HonoApp) => {
  app.route("/upload", uploadRoute);
};
