import { zValidator } from "@hono/zod-validator";
import type { User } from "@prisma/client"; // Import User type
import { Hono } from "hono";
import { z } from "zod";
import { ZVisibility } from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { deleteProdFile, deleteTmpFile } from "@/lib/s3";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

// Define Env locally or import if available. using inline for now to match HonoApp
type Env = {
  Variables: {
    user?: User;
  };
};

const MoviePatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  seriesId: z.string().optional().nullable(),
  visibility: ZVisibility.optional(),
  order: z.number().optional(),
});

const app = new Hono<Env>();

export const movieRoute = app
  .get("/:movie", async (c) => {
    const param = c.req.param("movie");
    if (!param) {
      return badRequest(c, "No movie provided");
    }
    const movie = await prisma.movie.findUnique({
      where: {
        id: param,
      },
      include: {
        author: true,
        series: {
          include: {
            author: true,
            movies: {
              orderBy: [
                {
                  order: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
              include: {
                author: true,
                variants: true,
              },
            },
          },
        },
        variants: true,
      },
    });
    if (!movie) {
      return notFound(c, "Movie not found");
    }

    if (movie.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== movie.authorId && user.role !== "ADMIN")) {
        return notFound(c, "Movie not found");
      }
    }

    return ok(c, {
      ...filterMovie(movie),
      isOwner: c.get("user")?.id === movie.authorId,
    });
  })
  .patch("/:movie", zValidator("json", MoviePatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("movie");
    if (!param) {
      return badRequest(c, "No movie provided");
    }

    const existingMovie = await prisma.movie.findUnique({
      where: { id: param },
    });
    if (!existingMovie) {
      return notFound(c, "Movie not found");
    }

    // Check ownership: owner or admin (for system accounts)
    const isOwner = existingMovie.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(existingMovie.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to edit this movie");
    }

    const { title, description, seriesId, visibility, order } =
      c.req.valid("json");
    const movie = await prisma.movie.update({
      where: {
        id: param,
      },
      data: {
        title: title ?? existingMovie.title,
        description: description ?? existingMovie.description,
        seriesId:
          seriesId === null ? null : (seriesId ?? existingMovie.seriesId),
        visibility: visibility ?? existingMovie.visibility,
        order: order ?? existingMovie.order,
      },
      include: {
        author: true,
        series: {
          include: {
            author: true,
            movies: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                author: true,
                variants: true,
              },
            },
          },
        },
        variants: true,
      },
    });
    return ok(c, filterMovie(movie));
  })
  .delete("/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("movie");
    if (!param) {
      return badRequest(c, "No movie provided");
    }

    const movie = await prisma.movie.findUnique({
      where: { id: param },
      include: { variants: true },
    });
    if (!movie) {
      return notFound(c, "Movie not found");
    }

    // Check ownership: owner or admin (for system accounts)
    const isOwner = movie.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(movie.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to delete this movie");
    }

    // Try to delete S3 files (don't fail if this errors)
    for (const variant of movie.variants) {
      try {
        if (variant.s3Key) {
          await deleteProdFile(variant.s3Key);
          await deleteTmpFile(variant.s3Key);
        }
      } catch (e) {
        console.error("Failed to delete S3 files for variant", variant.id, e);
      }
    }

    // Delete from playlists first
    await prisma.movieOnPlaylist.deleteMany({
      where: { movieId: param },
    });

    // Delete variants
    await prisma.movieVariant.deleteMany({
      where: { movieId: param },
    });

    // Delete movie
    await prisma.movie.delete({
      where: { id: param },
    });

    return ok(c, { success: true });
  });

const isSystemAccount = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  return user?.password === null;
};
