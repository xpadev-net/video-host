import { zValidator } from "@hono/zod-validator";
import type { User } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { FilteredMovie, PaginatedResponse } from "@/@types/models";
import { ZVisibility } from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { addEncodeJob, setEncodeProgress } from "@/lib/redis";
import { movieRoute } from "@/routes/api/v4/movies/[movie]";
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
  author: z.string().optional(),
  mine: z.string().optional(),
});

const MovieBodySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  seriesId: z.string().optional(),
  s3Key: z.string(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(), // Admin only
  order: z.number().optional(),
});

const app = new Hono<Env>();

export const moviesRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query, author } = c.req.valid("query");

    const where = buildVisibilityFilter(c.get("user"), query, author);

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
  })
  .post("/", zValidator("json", MovieBodySchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const data = c.req.valid("json");
    // The zValidator already handles invalid data, so this check is technically redundant
    // but kept for consistency if the schema was more complex or had custom refinements.
    if (!data) {
      return badRequest(c, "Invalid data");
    }

    // Handle asUserId for admin proxy
    let authorId = user.id;
    if (data.asUserId) {
      if (user.role !== "ADMIN") {
        return unauthorized(c, "Only admins can post as other users");
      }
      // Verify target user is a system account (password is null)
      const targetUser = await prisma.user.findUnique({
        where: { id: data.asUserId },
      });
      if (!targetUser || targetUser.password !== null) {
        return badRequest(c, "Target user must be a system account");
      }
      authorId = data.asUserId;
    }

    const movie = await prisma.movie.create({
      data: {
        title: data.title,
        description: data.description,
        authorId,
        seriesId: data.seriesId,
        visibility: data.visibility,
        order: data.order ?? 0,
        variants: {
          create: {
            variantId: "original",
            contentUrl: "", // Will be set after encoding
            s3Key: data.s3Key,
            status: "PROCESSING",
          },
        },
      },
      include: {
        series: {
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
        },
        author: true,
        variants: true,
      },
    });

    // Add encode job to Redis queue
    await addEncodeJob({
      movieId: movie.id,
      s3Key: data.s3Key,
      userId: authorId,
      createdAt: new Date().toISOString(),
    });

    // Set initial queued status for progress tracking
    await setEncodeProgress(movie.id, { status: "queued" });

    if (data.seriesId) {
      await prisma.series.update({
        where: {
          id: data.seriesId,
        },
        data: {
          updatedAt: new Date(),
        },
      });
    }
    return ok(c, filterMovie(movie));
  })
  .route("/", movieRoute);
