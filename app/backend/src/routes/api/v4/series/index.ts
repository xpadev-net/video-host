import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  type FormattedSeries,
  type PaginatedResponse,
  ZBasicVisibility,
} from "@/@types/models";
import { filterSeries } from "@/lib/filter";
import { formatSeries } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { getDistinctSuggestPage } from "@/lib/suggest";
import { seriesDetailRoute } from "@/routes/api/v4/series/[series]";
import {
  buildMovieAccessWhere,
  buildVisibilityFilter,
} from "@/utils/buildVisibilityFilter";
import { DescriptionSchema, TitleSchema } from "@/utils/inputSchemas";
import { resolveAuthorId } from "@/utils/movieAuth";
import { MAX_RELATION_MOVIES, paginationQuerySchema } from "@/utils/pagination";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const QuerySchema = paginationQuerySchema().extend({
  query: z.string().optional(),
  suggest: z
    .string()
    .optional()
    .transform((value) => value !== undefined),
  author: z.string().optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const PostSeriesSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema,
  visibility: ZBasicVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const app = new Hono<Env>();

export const seriesRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const user = c.get("user");
    const { page, limit, query, author, suggest, mine } = c.req.valid("query");

    const where: Prisma.SeriesWhereInput =
      buildVisibilityFilter<Prisma.SeriesWhereInput>(user, query, author);
    if (mine) {
      if (!user) unauthorized("Authentication required");
      where.authorId = user.role === "ADMIN" && author ? author : user.id;
    }

    if (suggest) {
      const authorId = mine
        ? user?.role === "ADMIN" && author
          ? author
          : user?.id
        : author;
      const { ids, totalCount } = await getDistinctSuggestPage({
        table: "Series",
        user,
        query,
        authorId,
        page,
        limit,
      });
      const rows = ids.length
        ? await prisma.series.findMany({
            where: { id: { in: ids } },
            include: { author: true },
          })
        : [];
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const items = ids.flatMap((id) => {
        const row = rowsById.get(id);
        return row ? [formatSeries(filterSeries(row))] : [];
      });
      const totalPages = Math.ceil(totalCount / limit);

      const response: PaginatedResponse<FormattedSeries> = {
        items,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
      return ok(c, response);
    }

    const totalCount = await prisma.series.count({ where });

    const series = await prisma.series.findMany({
      include: {
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
          take: 10,
          include: {
            author: true,
            variants: true,
          },
        },
        author: true,
      },
      where,
      orderBy: {
        updatedAt: "desc",
      },
      take: limit,
      skip: (page - 1) * limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: PaginatedResponse<FormattedSeries> = {
      items: series.map((s) => formatSeries(filterSeries(s))),
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
  .post("/", zValidator("json", PostSeriesSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const { title, description, visibility, asUserId } = c.req.valid("json");

    const authorId = await resolveAuthorId(user, asUserId);

    const series = await prisma.series.create({
      data: {
        title: title,
        description: description,
        authorId: authorId,
        visibility: visibility,
      },
      include: {
        author: true,
        movies: {
          where: buildMovieAccessWhere(user),
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
  .route("/", seriesDetailRoute);

export const registerSeriesRoutes = (app: HonoApp) => {
  app.route("/series", seriesRoute);
};
