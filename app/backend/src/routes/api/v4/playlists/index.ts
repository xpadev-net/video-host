import { zValidator } from "@hono/zod-validator";
import type { User } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import {
  type FilteredPlaylist,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { playlistDetailRoute } from "./[playlist]";

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
  author: z.string().optional(),
  mine: z.string().optional(), // boolean check on value "true"? Original logic: `c.req.queries("mine")?.[0] === "true"`
});

const CreatePlaylistSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const app = new Hono<Env>();

export const playlistsRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const user = c.get("user");
    const { page, limit, author } = c.req.valid("query");
    const mine = c.req.query("mine") === "true"; // Check "true" string

    // Build where clause
    const where: {
      authorId?: string;
      visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
      OR?: Array<{
        visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
        authorId?: string;
      }>;
    } = {};

    if (mine && user) {
      where.authorId = user.id;
    } else if (author) {
      where.authorId = author;
      // Non-owners can only see public playlists
      if (!user || user.id !== author) {
        where.visibility = "PUBLIC";
      }
    } else {
      // Public playlists only for unauthenticated or non-specific requests
      if (user) {
        where.OR = [{ visibility: "PUBLIC" }, { authorId: user.id }];
      } else {
        where.visibility = "PUBLIC";
      }
    }

    const totalCount = await prisma.playlist.count({ where });

    const playlists = await prisma.playlist.findMany({
      where,
      include: {
        author: true,
        movies: {
          orderBy: { order: "asc" },
          include: {
            movie: {
              include: {
                author: true,
                variants: true,
              },
            },
          },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: PaginatedResponse<FilteredPlaylist> = {
      items: playlists.map(filterPlaylist),
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
  .post("/", zValidator("json", CreatePlaylistSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const { title, description, visibility, asUserId } = c.req.valid("json");

    // Handle asUserId for admin proxy
    let authorId = user.id;
    if (asUserId) {
      if (user.role !== "ADMIN") {
        return unauthorized(c, "Only admins can create as other users");
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: asUserId },
      });
      if (!targetUser || targetUser.password !== null) {
        return badRequest(c, "Target user must be a system account");
      }
      authorId = asUserId;
    }

    const playlist = await prisma.playlist.create({
      data: {
        title,
        description,
        visibility,
        authorId,
      },
      include: {
        author: true,
        movies: {
          orderBy: { order: "asc" },
          include: {
            movie: {
              include: {
                author: true,
                variants: true,
              },
            },
          },
        },
      },
    });

    return ok(c, filterPlaylist(playlist));
  })
  .route("/", playlistDetailRoute);

export const registerPlaylistsRoutes = (app: HonoApp) => {
  app.route("/playlists", playlistsRoute);
};
