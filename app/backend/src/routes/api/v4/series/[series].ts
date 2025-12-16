import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import {
  type FilteredMovie,
  type FilteredSeries,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterMovie, filterSeries } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerSeriesRoute = (app: HonoApp) => {
  handleGet(app);
  handlePatch(app);
  handleGetMovies(app);
};

const DEFAULT_MOVIES_LIMIT = 20;
const MAX_MOVIES_LIMIT = 100;

const handleGet = (app: HonoApp) => {
  app.get("/:series", async (c) => {
    const seriesId = c.req.param("series");
    if (!seriesId) {
      return notFound(c, "Series not found");
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
      return notFound(c, "Series not found");
    }

    if (series.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== series.authorId && user.role !== "ADMIN")) {
        return notFound(c, "Series not found");
      }
    }

    // If pagination metadata is requested, get total count
    if (includeMoviesCount && series.movies.length > 0) {
      const totalMoviesCount = await prisma.movie.count({
        where: { seriesId: seriesId },
      });

      const filteredSeries = filterSeries(series) as FilteredSeries & {
        moviesPagination?: {
          page: number;
          limit: number;
          totalCount: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      };

      const totalPages = Math.ceil(totalMoviesCount / moviesLimit);
      filteredSeries.moviesPagination = {
        page: moviesPage,
        limit: moviesLimit,
        totalCount: totalMoviesCount,
        totalPages,
        hasNext: moviesPage < totalPages,
        hasPrev: moviesPage > 1,
      };

      return ok(c, filteredSeries);
    }

    return ok(c, filterSeries(series));
  });
};

const handleGetMovies = (app: HonoApp) => {
  app.get("/:series/movies", async (c) => {
    const seriesId = c.req.param("series");
    if (!seriesId) {
      return notFound(c, "Series not found");
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
      return notFound(c, "Series not found");
    }

    if (series.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== series.authorId && user.role !== "ADMIN")) {
        return notFound(c, "Series not found");
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

    const response: PaginatedResponse<FilteredMovie> = {
      items: movies.map(filterMovie),
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
  });
};

const PatchSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  visibility: ZVisibility.optional(),
});

const handlePatch = (app: HonoApp) => {
  app.patch("/:series", zValidator("json", PatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("series");
    if (!param) {
      return notFound(c, "Series not found");
    }
    {
      const series = await prisma.series.findUnique({
        where: {
          id: param,
          authorId: user.id,
        },
      });
      if (!series) {
        return notFound(c, "Series not found");
      }
    }
    const { title, description, visibility } = c.req.valid("json");
    const series = await prisma.series.update({
      where: {
        id: param,
        authorId: user.id,
      },
      data: {
        title,
        description,
        visibility,
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
  });
};
