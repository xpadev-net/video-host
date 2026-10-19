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
import { seriesDetailRoute } from "@/routes/api/v4/series/[series]";
import {
  buildMovieAccessWhere,
  buildVisibilityFilter,
} from "@/utils/buildVisibilityFilter";
import { DescriptionSchema, TitleSchema } from "@/utils/inputSchemas";
import { resolveAuthorId } from "@/utils/movieAuth";
import { paginationQuerySchema } from "@/utils/pagination";
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

    const where: Prisma.SeriesWhereInput = buildVisibilityFilter(
      user,
      query,
      author,
    );
    if (mine) {
      if (!user) unauthorized("Authentication required");
      where.authorId = user.role === "ADMIN" && author ? author : user.id;
    }

    // Suggestions show one entry per title. Grouping happens in the database
    // (so title equivalence follows the column collation) and drives both the
    // total and the page; Prisma's `distinct` dedupes in memory after paging.
    const titleGroups = suggest
      ? await prisma.series.groupBy({
          by: ["title"],
          where,
          _max: { id: true, updatedAt: true },
          orderBy: { _max: { updatedAt: "desc" } },
          take: limit,
          skip: (page - 1) * limit,
        })
      : null;
    const totalCount = suggest
      ? (await prisma.series.groupBy({ by: ["title"], where })).length
      : await prisma.series.count({ where });

    const pageIds = (titleGroups ?? []).flatMap((g) => g._max.id ?? []);

    const series = await prisma.series.findMany({
      include: suggest
        ? {
            author: true,
          }
        : {
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
      where: titleGroups ? { id: { in: pageIds } } : where,
      orderBy: {
        updatedAt: "desc",
      },
      ...(titleGroups ? {} : { take: limit, skip: (page - 1) * limit }),
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
