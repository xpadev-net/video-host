import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  type FormattedMovie,
  type PaginatedResponse,
  ZBasicVisibility,
} from "@/@types/models";
import { filterMovie, filterSeries } from "@/lib/filter";
import { formatMovie, formatSeries } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import {
  buildMovieAccessWhere,
  canViewOwnedEntity,
} from "@/utils/buildVisibilityFilter";
import { DescriptionSchema, TitleSchema } from "@/utils/inputSchemas";
import { canManageOwned } from "@/utils/movieAuth";
import {
  MAX_RELATION_MOVIES,
  PageNumberSchema,
  pageSizeSchema,
  paginationQuerySchema,
} from "@/utils/pagination";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

const DEFAULT_MOVIES_LIMIT = 20;
const MAX_MOVIES_LIMIT = MAX_RELATION_MOVIES;

const SeriesDetailQuerySchema = z.object({
  moviesPage: PageNumberSchema,
  moviesLimit: pageSizeSchema(DEFAULT_MOVIES_LIMIT, MAX_MOVIES_LIMIT),
  includeMoviesCount: z.string().optional(),
});
const SeriesMoviesQuerySchema = paginationQuerySchema(
  DEFAULT_MOVIES_LIMIT,
  MAX_MOVIES_LIMIT,
);

const SeriesPatchSchema = z.object({
  title: TitleSchema.optional(),
  description: DescriptionSchema.nullable().optional(),
  visibility: ZBasicVisibility.optional(),
});

const AddMovieSchema = z.object({
  movieId: z.string(),
});

const ReorderMoviesSchema = z.object({
  movieIds: z.array(z.string()),
});

export const seriesDetailRoute = app
  .get("/:series", zValidator("query", SeriesDetailQuerySchema), async (c) => {
    const seriesId = c.req.param("series");
    if (!seriesId) {
      notFound("Series not found");
    }

    // Check if client requests paginated movies
    const { moviesPage, moviesLimit, includeMoviesCount } =
      c.req.valid("query");

    const user = c.get("user");
    const movieAccessWhere = buildMovieAccessWhere(user);

    const series = await prisma.series.findFirst({
      where: {
        id: seriesId,
      },
      include: {
        author: {
          include: { profileViewers: { select: { userId: true } } },
        },
        movies: {
          where: movieAccessWhere,
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
          take: moviesLimit,
          skip: (moviesPage - 1) * moviesLimit,
        },
      },
    });

    if (!series) {
      notFound("Series not found");
    }

    if (!canViewOwnedEntity(series, user)) {
      notFound("Series not found");
    }

    // If pagination metadata is requested, get total count. This must not
    // depend on the current page being non-empty: an out-of-range offset
    // returns zero rows while totalPages/hasNext/hasPrev still describe the
    // filtered result set.
    if (includeMoviesCount !== undefined) {
      const totalMoviesCount = await prisma.movie.count({
        where: { seriesId: seriesId, ...movieAccessWhere },
      });

      const totalPages = Math.ceil(totalMoviesCount / moviesLimit);
      const filteredSeries = {
        ...formatSeries(filterSeries(series)),
        moviesPagination: {
          page: moviesPage,
          limit: moviesLimit,
          totalCount: totalMoviesCount,
          totalPages,
          hasNext: moviesPage < totalPages,
          hasPrev: moviesPage > 1,
        },
      };

      return ok(c, filteredSeries);
    }

    return ok(c, formatSeries(filterSeries(series)));
  })
  .patch("/:series", zValidator("json", SeriesPatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("series");
    if (!param) {
      notFound("Series not found");
    }

    const existingSeries = await prisma.series.findUnique({
      where: { id: param },
    });
    if (!existingSeries) {
      notFound("Series not found");
    }

    // Check ownership: owner or admin (for system accounts)
    if (!(await canManageOwned(user, existingSeries.authorId))) {
      forbidden("Not authorized to edit this series");
    }

    const { title, description, visibility } = c.req.valid("json");
    const series = await prisma.series.update({
      where: {
        id: param,
      },
      data: {
        title: title ?? existingSeries.title,
        description:
          description === undefined ? existingSeries.description : description,
        visibility: visibility ?? existingSeries.visibility,
      },
      include: {
        author: true,
        movies: {
          where: buildMovieAccessWhere(user),
          orderBy: {
            createdAt: "asc",
          },
          take: MAX_RELATION_MOVIES,
          include: {
            author: true,
            variants: true,
          },
        },
      },
    });
    return ok(c, formatSeries(filterSeries(series)));
  })
  .delete("/:series", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("series");
    if (!param) {
      notFound("Series not found");
    }

    const series = await prisma.series.findUnique({
      where: { id: param },
    });
    if (!series) {
      notFound("Series not found");
    }

    // Check ownership: owner or admin (for system accounts)
    if (!(await canManageOwned(user, series.authorId))) {
      forbidden("Not authorized to delete this series");
    }

    // Unlink movies from series (don't delete them)
    await prisma.movie.updateMany({
      where: { seriesId: param },
      data: { seriesId: null },
    });

    // Delete series
    await prisma.series.delete({
      where: { id: param },
    });

    return ok(c, { success: true });
  })
  .get(
    "/:series/movies",
    zValidator("query", SeriesMoviesQuerySchema),
    async (c) => {
      const seriesId = c.req.param("series");
      if (!seriesId) {
        notFound("Series not found");
      }

      const { page, limit } = c.req.valid("query");

      // First check if series exists and user has access
      const user = c.get("user");
      const series = await prisma.series.findFirst({
        where: { id: seriesId },
        include: {
          author: {
            include: { profileViewers: { select: { userId: true } } },
          },
        },
      });

      if (!series) {
        notFound("Series not found");
      }

      if (!canViewOwnedEntity(series, user)) {
        notFound("Series not found");
      }

      const moviesWhere = { seriesId, ...buildMovieAccessWhere(user) };

      // Get total count and movies
      const totalCount = await prisma.movie.count({
        where: moviesWhere,
      });

      const movies = await prisma.movie.findMany({
        where: moviesWhere,
        include: {
          author: true,
          series: {
            include: {
              author: true,
            },
          },
          variants: true,
        },
        orderBy: [
          {
            order: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
        take: limit,
        skip: (page - 1) * limit,
      });

      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      const response: PaginatedResponse<FormattedMovie> = {
        items: movies.map((v) => formatMovie(filterMovie(v))),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext,
          hasPrev,
        },
      };

      return ok(c, response);
    },
  )
  .post("/:series/movies", zValidator("json", AddMovieSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const seriesId = c.req.param("series");
    if (!seriesId) {
      notFound("Series not found");
    }

    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series) {
      notFound("Series not found");
    }

    if (!(await canManageOwned(user, series.authorId))) {
      forbidden("Not authorized to edit this series");
    }

    const { movieId } = c.req.valid("json");

    // Check if movie exists
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    // Only movies the caller may manage can be pulled into a series; a
    // movie they merely know the id of is reported as missing.
    if (!(await canManageOwned(user, movie.authorId))) {
      notFound("Movie not found");
    }

    // Check if movie is already in this series
    if (movie.seriesId === seriesId) {
      badRequest("Movie is already in this series");
    }

    // Get max order
    const maxOrder = await prisma.movie.aggregate({
      where: { seriesId },
      _max: { order: true },
    });

    // Add movie to series
    await prisma.movie.update({
      where: { id: movieId },
      data: {
        seriesId,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    // Return updated series
    const updatedSeries = await prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        author: true,
        movies: {
          where: buildMovieAccessWhere(user),
          orderBy: { order: "asc" },
          take: MAX_RELATION_MOVIES,
          include: { author: true, variants: true },
        },
      },
    });

    if (!updatedSeries) {
      notFound("Series not found");
    }

    return ok(c, formatSeries(filterSeries(updatedSeries)));
  })
  .delete("/:series/movies/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const seriesId = c.req.param("series");
    const movieId = c.req.param("movie");
    if (!seriesId || !movieId) {
      notFound("Not found");
    }

    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    });
    if (!series) {
      notFound("Series not found");
    }

    if (!(await canManageOwned(user, series.authorId))) {
      forbidden("Not authorized to edit this series");
    }

    // Remove movie from series (don't delete the movie)
    // Scoped to this series so other series' movies cannot be detached.
    const detached = await prisma.movie.updateMany({
      where: { id: movieId, seriesId },
      data: { seriesId: null, order: 0 },
    });
    if (detached.count === 0) {
      notFound("Movie not found in this series");
    }

    return ok(c, { success: true });
  })
  .patch(
    "/:series/movies",
    zValidator("json", ReorderMoviesSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        unauthorized("Unauthorized");
      }

      const seriesId = c.req.param("series");
      if (!seriesId) {
        notFound("Series not found");
      }

      const series = await prisma.series.findUnique({
        where: { id: seriesId },
      });
      if (!series) {
        notFound("Series not found");
      }

      if (!(await canManageOwned(user, series.authorId))) {
        forbidden("Not authorized to edit this series");
      }

      const { movieIds } = c.req.valid("json");

      const uniqueMovieIds = new Set(movieIds);
      if (uniqueMovieIds.size !== movieIds.length) {
        badRequest("movieIds contains duplicates");
      }
      const inSeries = await prisma.movie.count({
        where: { id: { in: movieIds }, seriesId },
      });
      if (inSeries !== movieIds.length) {
        badRequest("movieIds must all belong to this series");
      }

      // Update order for each movie atomically
      await prisma.$transaction(
        movieIds.map((movieId, index) =>
          prisma.movie.update({
            where: { id: movieId },
            data: { order: index + 1 },
          }),
        ),
      );

      // Return updated series
      const updatedSeries = await prisma.series.findUnique({
        where: { id: seriesId },
        include: {
          author: true,
          movies: {
            where: buildMovieAccessWhere(user),
            orderBy: { order: "asc" },
            take: MAX_RELATION_MOVIES,
            include: { author: true, variants: true },
          },
        },
      });

      if (!updatedSeries) {
        notFound("Series not found");
      }

      return ok(c, formatSeries(filterSeries(updatedSeries)));
    },
  );

export const registerSeriesRoute = (app: HonoApp) => {
  app.route("/", seriesDetailRoute);
};
