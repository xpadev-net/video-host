import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
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
import { paginationQuerySchema } from "@/utils/pagination";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const QuerySchema = paginationQuerySchema().extend({
  query: z.string().optional(),
  author: z.string().optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const app = new Hono<Env>();

export const moviesRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query, author, mine } = c.req.valid("query");
    const user = c.get("user");

    // Others' movies additionally require a READY variant — in-flight
    // uploads stay private regardless of their stored visibility.
    const conditions: Prisma.MovieWhereInput[] = [
      buildVisibilityFilter(user, query, author, true),
      readyOrOwnMovieFilter(user),
    ];
    if (mine) {
      if (!user) unauthorized("Authentication required");
      conditions.push({
        authorId: user.role === "ADMIN" && author ? author : user.id,
      });
    }
    const where: Prisma.MovieWhereInput = { AND: conditions };

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
