import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { MAX_UPLOAD_BYTES } from "@/env";
import { filterMovie } from "@/lib/filter";
import { formatMovie } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { addEncodeJob, setEncodeProgress } from "@/lib/redis";
import {
  deleteTmpFile,
  generateUploadKey,
  getPresignedUploadUrl,
  getTmpFileSize,
} from "@/lib/s3";
import { canManageOwned, resolveAuthorId } from "@/utils/movieAuth";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/utils/response";
import { ok } from "@/utils/response/ok";

const FilenameSchema = z.string().min(1).max(255);
const UploadSizeSchema = z.number().int().positive().max(MAX_UPLOAD_BYTES);
// Browsers report an empty File.type for containers they do not know; the
// frontend sends application/octet-stream for those.
const VideoContentTypeSchema = z
  .string()
  .regex(/^(video\/[\w.+-]+|application\/octet-stream)$/);

const InitUploadSchema = z.object({
  filename: FilenameSchema,
  contentType: VideoContentTypeSchema,
  size: UploadSizeSchema,
  title: z.string().max(255).optional(),
  asUserId: z.string().optional(), // Admin only
});

const RetryUploadSchema = z.object({
  filename: FilenameSchema,
  contentType: VideoContentTypeSchema,
  size: UploadSizeSchema,
});

const titleFromFilename = (filename: string): string => {
  const stem = filename.replace(/\.[^/.]+$/, "");
  return stem || filename;
};

const app = new Hono<Env>();

export const uploadRoute = app
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

    const { filename, contentType, size, title, asUserId } =
      c.req.valid("json");
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

    const uploadUrl = await getPresignedUploadUrl(key, contentType, size);

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

    if (!(await canManageOwned(user, movie.authorId))) {
      forbidden("Not authorized to upload to this movie");
    }

    const variant = movie.variants.find((v) => v.status === "UPLOADING");
    if (!variant) {
      badRequest("Movie is not awaiting upload");
    }

    const { filename, contentType, size } = c.req.valid("json");
    const key = generateUploadKey(movie.authorId, filename);

    // Claim atomically: if /complete flipped the variant to PROCESSING between
    // our find and this update, bail instead of swapping the key out from
    // under the encode job that was just queued.
    const updated = await prisma.movieVariant.updateMany({
      where: { id: variant.id, status: "UPLOADING" },
      data: { s3Key: key },
    });
    if (updated.count === 0) {
      badRequest("Movie is not awaiting upload");
    }

    // A previous upload may have fully landed without /complete being called;
    // drop that object so it isn't orphaned in the tmp bucket.
    if (variant.s3Key && variant.s3Key !== key) {
      await deleteTmpFile(variant.s3Key).catch(() => {});
    }

    const uploadUrl = await getPresignedUploadUrl(key, contentType, size);

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

    if (!(await canManageOwned(user, movie.authorId))) {
      forbidden("Not authorized to complete this upload");
    }

    const variant = movie.variants.find((v) => v.status === "UPLOADING");
    if (!variant) {
      // Already completed (or failed): nothing left to queue.
      return ok(c, { success: true });
    }

    const size = variant.s3Key ? await getTmpFileSize(variant.s3Key) : null;
    if (size === null || !variant.s3Key) {
      badRequest("Upload has not finished yet");
    }
    if (size > MAX_UPLOAD_BYTES) {
      // The presigned PUT cannot cap the size, so reject oversized objects
      // here and drop them instead of feeding them to the encoder.
      await deleteTmpFile(variant.s3Key).catch(() => {});
      badRequest("Uploaded file is too large");
    }

    // Claim the transition atomically so a duplicate request can't queue a
    // second encode job for the same movie. The s3Key guard also closes the
    // race where /:movieId/url swaps the key after our read: completing then
    // would queue the stale file while the retry uploads a different one.
    const updated = await prisma.movieVariant.updateMany({
      where: { id: variant.id, status: "UPLOADING", s3Key: variant.s3Key },
      data: { status: "PROCESSING" },
    });
    if (updated.count === 0) {
      const current = await prisma.movieVariant.findUnique({
        where: { id: variant.id },
      });
      if (current?.status === "UPLOADING") {
        // Key was swapped by a fresh upload — this completion is stale.
        badRequest("Upload was restarted; complete the new upload instead");
      }
      return ok(c, { success: true });
    }

    try {
      await addEncodeJob({
        movieId: movie.id,
        s3Key: variant.s3Key,
        userId: movie.authorId,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // Revert so /complete can be retried — otherwise the movie would sit in
      // PROCESSING forever with no encode job ever queued.
      await prisma.movieVariant.updateMany({
        where: { id: variant.id, status: "PROCESSING" },
        data: { status: "UPLOADING" },
      });
      throw error;
    }
    await setEncodeProgress(movie.id, { status: "queued" });

    return ok(c, { success: true });
  });

export const registerUploadRoute = (app: HonoApp) => {
  app.route("/upload", uploadRoute);
};
