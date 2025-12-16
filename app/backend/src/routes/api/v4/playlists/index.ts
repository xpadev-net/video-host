import { zValidator } from "@hono/zod-validator";
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
import { registerPlaylistRoute } from "./[playlist]";

export const registerPlaylistsRoutes = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerPlaylistRoute(api);
  registerGetIndexRoute(api);
  registerPostIndexRoute(api);
  app.route("/playlists", api);
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const registerGetIndexRoute = (app: HonoApp) => {
  app.get("/", async (c) => {
    const user = c.get("user");
    const page = parseInt(c.req.queries("page")?.[0] || "1", 10);
    const limit = Math.min(
      parseInt(c.req.queries("limit")?.[0] || DEFAULT_PAGE_SIZE.toString(), 10),
      MAX_PAGE_SIZE,
    );
    const author = c.req.queries("author")?.[0];
    const mine = c.req.queries("mine")?.[0] === "true";

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
  });
};

const CreatePlaylistSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const registerPostIndexRoute = (app: HonoApp) => {
  app.post("/", zValidator("json", CreatePlaylistSchema), async (c) => {
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
  });
};
