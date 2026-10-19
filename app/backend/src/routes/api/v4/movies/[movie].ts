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
import {
  DescriptionSchema,
  MAX_VIEWER_IDS,
  TitleSchema,
} from "@/utils/inputSchemas";
import { assertCanManageSeries, canManageOwned } from "@/utils/movieAuth";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/utils/response";
import { ok } from "@/utils/response/ok";

const MoviePatchSchema = z.object({
  title: TitleSchema.optional(),
  description: DescriptionSchema.nullable().optional(),
  seriesId: z.string().optional().nullable(),
  visibility: ZVisibility.optional(),
  viewerIds: z.array(z.string()).max(MAX_VIEWER_IDS).optional(),
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
    if (!(await canManageOwned(user, existingMovie.authorId))) {
      forbidden("Not authorized to edit this movie");
    }

    const { title, description, seriesId, visibility, viewerIds, order } =
      c.req.valid("json");

    if (seriesId) {
      await assertCanManageSeries(user, seriesId);
    }

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
        description:
          description === undefined ? existingMovie.description : description,
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
      formatMovie(
        filterMovie({
          ...movie,
          viewers: movie.viewers.map((viewer) => viewer.user),
        }),
      ),
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
    if (!(await canManageOwned(user, movie.authorId))) {
      forbidden("Not authorized to delete this movie");
    }

    // Join rows, variants, and viewer entries are removed by database
    // cascades as part of the same delete statement.
    await prisma.movie.delete({
      where: { id: param },
    });

    // Database state is removed atomically first; object storage cleanup is
    // best effort and can be retried independently if the provider is down.
    await Promise.all(
      movie.variants.flatMap((variant) => {
        if (!variant.s3Key) return [];
        return [
          deleteProdFile(variant.s3Key).catch((error) =>
            console.error(
              "Failed to delete prod object for variant",
              variant.id,
              error,
            ),
          ),
          deleteTmpFile(variant.s3Key).catch((error) =>
            console.error(
              "Failed to delete tmp object for variant",
              variant.id,
              error,
            ),
          ),
        ];
      }),
    );

    return ok(c, { success: true });
  });
