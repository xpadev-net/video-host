import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import {
  type FilteredMovie,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { addEncodeJob, setEncodeProgress } from "@/lib/redis";
import { registerMovieRoute } from "@/routes/api/v4/movies/[movie]";
import { buildVisibilityFilter } from "@/utils/buildVisibilityFilter";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerMoviesRoutes = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerMovieRoute(api);
  registerGetIndexRoute(api);
  registerPostIndexRoute(api);
  app.route("/movies", api);
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const registerGetIndexRoute = (app: HonoApp) => {
  app.get("/", async (c) => {
    const page = parseInt(c.req.queries("page")?.[0] || "1", 10);
    const limit = Math.min(
      parseInt(c.req.queries("limit")?.[0] || DEFAULT_PAGE_SIZE.toString(), 10),
      MAX_PAGE_SIZE,
    );
    const query = c.req.queries("query")?.[0];
    const author = c.req.queries("author")?.[0];

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
  });
};

const MovieBodySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  seriesId: z.string().optional(),
  s3Key: z.string(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
  order: z.number().optional(),
});

const registerPostIndexRoute = (app: HonoApp) => {
  app.post("/", zValidator("json", MovieBodySchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const data = c.req.valid("json");
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
  });
};
