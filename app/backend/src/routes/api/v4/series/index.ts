import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import {
  type FilteredSeries,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterSeries } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { registerSeriesRoute } from "@/routes/api/v4/series/[series]";
import { buildVisibilityFilter } from "@/utils/buildVisibilityFilter";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerSeriesRoutes = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerSeriesRoute(api);
  registerGetIndexRoute(api);
  registerPostIndexRoute(api);
  app.route("/series", api);
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const registerGetIndexRoute = (app: HonoApp) => {
  app.get("/", async (c) => {
    const page = parseInt(c.req.queries("page")?.[0] ?? "1", 10);
    const limit = Math.min(
      parseInt(c.req.queries("limit")?.[0] || DEFAULT_PAGE_SIZE.toString(), 10),
      MAX_PAGE_SIZE,
    );
    const query = c.req.queries("query")?.[0];
    const suggest = (c.req.queries("suggest")?.length ?? 0) > 0;
    const author = c.req.queries("author")?.[0];

    const where: Prisma.SeriesWhereInput = buildVisibilityFilter(
      c.get("user"),
      query,
      author,
    );

    // Get total count for pagination metadata
    const totalCount = await prisma.series.count({ where });

    const series = await prisma.series.findMany({
      include: suggest
        ? {
            author: true,
          }
        : {
            movies: {
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
      distinct: suggest ? ["title"] : undefined,
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

    const response: PaginatedResponse<FilteredSeries> = {
      items: series.map(filterSeries),
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

const PostSeriesSchema = z.object({
  title: z.string(),
  description: z.string(),
  visibility: ZVisibility.optional().default("PUBLIC"),
});

const registerPostIndexRoute = (app: HonoApp) => {
  app.post("/", zValidator("json", PostSeriesSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const { title, description, visibility } = c.req.valid("json");
    const series = await prisma.series.create({
      data: {
        title: title,
        description: description,
        authorId: user.id,
        visibility: visibility,
      },
      include: {
        author: true,
        movies: {
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
