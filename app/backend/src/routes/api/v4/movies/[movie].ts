import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { formatMovie } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { deleteProdFile, deleteTmpFile } from "@/lib/s3";
import {
  buildMovieAccessWhere,
  canViewMovie,
  canViewOwnedEntity,
} from "@/utils/buildVisibilityFilter";
import { canManageMovie } from "@/utils/movieAuth";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const MoviePatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  seriesId: z.string().optional().nullable(),
  visibility: ZVisibility.optional(),
  viewerIds: z.array(z.string()).optional(),
  order: z.number().optional(),
});

const app = new Hono<Env>();

export const movieRoute = app
  .get("/:movie", async (c) => {
    const param = c.req.param("movie");
    if (!param) {
      badRequest("No movie provided");
    }
    const user = c.get("user");
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
              where: buildMovieAccessWhere(user),
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
        viewers: {
          include: {
            user: true,
          },
        },
      },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    if (!canViewMovie(movie, user)) {
      notFound("Movie not found");
    }

    // Until a variant is READY the movie is private for everyone but its
    // author and admins, whatever its stored visibility says — this also
    // covers LIMITED viewers.
    const isReady = movie.variants.some((v) => v.status === "READY");
    if (!isReady) {
      if (!user || (user.id !== movie.authorId && user.role !== "ADMIN")) {
        notFound("Movie not found");
      }
    }

    const canSeeViewers =
      !!user && (user.id === movie.authorId || user.role === "ADMIN");

    return ok(c, {
      ...formatMovie(
        filterMovie({
          ...movie,
          series:
            movie.series && canViewOwnedEntity(movie.series, user)
              ? movie.series
              : undefined,
          viewers: canSeeViewers
            ? movie.viewers.map((viewer) => viewer.user)
            : undefined,
        }),
      ),
      isOwner: user?.id === movie.authorId,
    });
  })
  .patch("/:movie", zValidator("json", MoviePatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("movie");
    if (!param) {
      badRequest("No movie provided");
    }

    const existingMovie = await prisma.movie.findUnique({
      where: { id: param },
    });
    if (!existingMovie) {
      notFound("Movie not found");
    }

    // Check ownership: owner or admin (for system accounts)
    if (!(await canManageMovie(user, existingMovie.authorId))) {
      unauthorized("Not authorized to edit this movie");
    }

    const { title, description, seriesId, visibility, viewerIds, order } =
      c.req.valid("json");

    const uniqueViewerIds = viewerIds ? [...new Set(viewerIds)] : undefined;
    if (uniqueViewerIds && uniqueViewerIds.length > 0) {
      const existing = await prisma.user.findMany({
        where: { id: { in: uniqueViewerIds } },
        select: { id: true },
      });
      if (existing.length !== uniqueViewerIds.length) {
        badRequest("viewerIds contains unknown users");
      }
    }

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
        viewers: uniqueViewerIds
          ? {
              deleteMany: {},
              create: uniqueViewerIds.map((userId) => ({ userId })),
            }
          : undefined,
      },
      include: {
        author: true,
        series: {
          include: {
            author: true,
            movies: {
              where: buildMovieAccessWhere(user),
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
        viewers: {
          include: {
            user: true,
          },
        },
      },
    });
    return ok(
      c,
      filterMovie({
        ...movie,
        viewers: movie.viewers.map((viewer) => viewer.user),
      }),
    );
  })
  .delete("/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("movie");
    if (!param) {
      badRequest("No movie provided");
    }

    const movie = await prisma.movie.findUnique({
      where: { id: param },
      include: { variants: true },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    // Check ownership: owner or admin (for system accounts)
    if (!(await canManageMovie(user, movie.authorId))) {
      unauthorized("Not authorized to delete this movie");
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
