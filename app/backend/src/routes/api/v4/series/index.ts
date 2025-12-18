import { zValidator } from "@hono/zod-validator";
import type { Prisma, User } from "@prisma/client"; // Fix: Prisma import
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
import { seriesDetailRoute } from "@/routes/api/v4/series/[series]";
import { buildVisibilityFilter } from "@/utils/buildVisibilityFilter";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

type Env = {
  Variables: {
    user?: User;
  };
};

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
  suggest: z.string().optional(), // boolean check on length? "suggest" query param usually has no value if present? or "true"? Original: `c.req.queries("suggest")?.length ?? 0) > 0`. So simply presence.
  author: z.string().optional(),
  mine: z.string().optional(),
});

const PostSeriesSchema = z.object({
  title: z.string(),
  description: z.string(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const app = new Hono<Env>();

export const seriesRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query, author } = c.req.valid("query");
    const suggest = c.req.query("suggest") !== undefined; // Check presence

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
  })
  .post("/", zValidator("json", PostSeriesSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const { title, description, visibility, asUserId } = c.req.valid("json");

    let authorId = user.id;
    if (asUserId) {
      if (user.role !== "ADMIN") {
        return unauthorized(c, "Only admins can create series for other users");
      }
      // Verify asUserId is a system account (or just allow admins to act as anyone? context implies system accounts)
      // Reusing logic from other files or just checking existence/system nature
      const targetUser = await prisma.user.findUnique({
        where: { id: asUserId },
      });
      if (!targetUser) {
        return badRequest(c, "Target user not found");
      }
      if (targetUser.password !== null) {
        return badRequest(c, "Can only create series for system accounts");
      }
      authorId = asUserId;
    }

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
          include: {
            author: true,
            variants: true,
          },
        },
      },
    });
    return ok(c, filterSeries(series));
  })
  .route("/", seriesDetailRoute);

export const registerSeriesRoutes = (app: HonoApp) => {
  app.route("/series", seriesRoute);
};
