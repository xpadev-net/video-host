import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/@types/hono";
import type { FormattedMovie, PaginatedResponse } from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { formatMovie } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { movieRoute } from "@/routes/api/v4/movies/[movie]";
import {
  buildVisibilityFilter,
  canViewOwnedEntity,
  readyOrOwnMovieFilter,
} from "@/utils/buildVisibilityFilter";
import { ok } from "@/utils/response/ok";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default("1")
    .transform((v) => parseInt(v, 10)),
  limit: z
    .string()
    .optional()
    .default(DEFAULT_PAGE_SIZE.toString())
    .transform((v) => Math.min(parseInt(v, 10), MAX_PAGE_SIZE)),
  query: z.string().optional(),
  author: z.string().optional(),
  mine: z.string().optional(),
});

const app = new Hono<Env>();

export const moviesRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query, author } = c.req.valid("query");
    const user = c.get("user");

    // Others' movies additionally require a READY variant — in-flight
    // uploads stay private regardless of their stored visibility.
    const where = {
      AND: [
        buildVisibilityFilter(user, query, author, true),
        readyOrOwnMovieFilter(user),
      ],
    };

    // Get total count for pagination metadata
    const totalCount = await prisma.movie.count({ where });

    const movies = await prisma.movie.findMany({
      where,
      include: {
        author: true,
        series: {
          include: {
            author: true,
          },
        },
        variants: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: (page - 1) * limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: PaginatedResponse<FormattedMovie> = {
      items: movies.map((v) =>
        formatMovie(
          filterMovie({
            ...v,
            series:
              v.series && canViewOwnedEntity(v.series, user)
                ? v.series
                : undefined,
          }),
        ),
      ),
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
  .route("/", movieRoute);
