import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  type FormattedMovie,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterMovie, filterSeries } from "@/lib/filter";
import { formatMovie, formatSeries } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { isSystemAccount } from "@/utils/systemAccountCache";

const app = new Hono<Env>();

const DEFAULT_MOVIES_LIMIT = 20;
const MAX_MOVIES_LIMIT = 100;

const SeriesPatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: ZVisibility.optional(),
});

const AddMovieSchema = z.object({
  movieId: z.string(),
});

const ReorderMoviesSchema = z.object({
  movieIds: z.array(z.string()),
});

export const seriesDetailRoute = app
  .get("/:series", async (c) => {
    const seriesId = c.req.param("series");
    if (!seriesId) {
      notFound("Series not found");
    }

    // Check if client requests paginated movies
    const moviesPage = parseInt(c.req.queries("moviesPage")?.[0] || "1", 10);
    const moviesLimit = Math.min(
      parseInt(
        c.req.queries("moviesLimit")?.[0] || DEFAULT_MOVIES_LIMIT.toString(),
        10,
      ),
      MAX_MOVIES_LIMIT,
    );
    const includeMoviesCount =
      (c.req.queries("includeMoviesCount")?.length ?? 0) > 0;

    const series = await prisma.series.findFirst({
      where: {
        id: seriesId,
      },
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
          take: moviesLimit,
          skip: (moviesPage - 1) * moviesLimit,
        },
      },
    });

    if (!series) {
      notFound("Series not found");
    }

    if (series.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== series.authorId && user.role !== "ADMIN")) {
        notFound("Series not found");
      }
    }

    // If pagination metadata is requested, get total count
    if (includeMoviesCount && series.movies.length > 0) {
      const totalMoviesCount = await prisma.movie.count({
        where: { seriesId: seriesId },
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

    return ok(c, filterSeries(series));
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
    const isOwner = existingSeries.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(existingSeries.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this series");
    }

    const { title, description, visibility } = c.req.valid("json");
    const series = await prisma.series.update({
      where: {
        id: param,
      },
      data: {
        title: title ?? existingSeries.title,
        description: description ?? existingSeries.description,
        visibility: visibility ?? existingSeries.visibility,
      },
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
    });
    return ok(c, filterSeries(series));
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
    const isOwner = series.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(series.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to delete this series");
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
  .get("/:series/movies", async (c) => {
    const seriesId = c.req.param("series");
    if (!seriesId) {
      notFound("Series not found");
    }

    const page = parseInt(c.req.queries("page")?.[0] || "1", 10);
    const limit = Math.min(
      parseInt(
        c.req.queries("limit")?.[0] || DEFAULT_MOVIES_LIMIT.toString(),
        10,
      ),
      MAX_MOVIES_LIMIT,
    );

    // First check if series exists and user has access
    const series = await prisma.series.findFirst({
      where: { id: seriesId },
    });

    if (!series) {
      notFound("Series not found");
    }

    if (series.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== series.authorId && user.role !== "ADMIN")) {
        notFound("Series not found");
      }
    }

    // Get total count and movies
    const totalCount = await prisma.movie.count({
      where: { seriesId: seriesId },
    });

    const movies = await prisma.movie.findMany({
      where: { seriesId: seriesId },
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
  })
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

    const isOwner = series.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(series.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this series");
    }

    const { movieId } = c.req.valid("json");

    // Check if movie exists
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
    });
    if (!movie) {
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
          orderBy: { order: "asc" },
          include: { author: true, variants: true },
        },
      },
    });

    if (!updatedSeries) {
      notFound("Series not found");
    }

    return ok(c, filterSeries(updatedSeries));
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

    const isOwner = series.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(series.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this series");
    }

    // Remove movie from series (don't delete the movie)
    await prisma.movie.update({
      where: { id: movieId },
      data: { seriesId: null, order: 0 },
    });

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

      const isOwner = series.authorId === user.id;
      const isAdminForSystemAccount =
        user.role === "ADMIN" && (await isSystemAccount(series.authorId));

      if (!isOwner && !isAdminForSystemAccount) {
        unauthorized("Not authorized to edit this series");
      }

      const { movieIds } = c.req.valid("json");

      // Update order for each movie
      await Promise.all(
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
            orderBy: { order: "asc" },
            include: { author: true, variants: true },
          },
        },
      });

      if (!updatedSeries) {
        notFound("Series not found");
      }

      return ok(c, filterSeries(updatedSeries));
    },
  );

export const registerSeriesRoute = (app: HonoApp) => {
  app.route("/", seriesDetailRoute);
};
