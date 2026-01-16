import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  type FilteredPlaylist,
  type PaginatedResponse,
  ZVisibility,
} from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { buildVisibilityFilter } from "@/utils/buildVisibilityFilter";
import { badRequest, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { playlistDetailRoute } from "./[playlist]";

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
  mine: z.string().optional(),
  query: z.string().optional(),
});

const PostPlaylistSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  visibility: ZVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const app = new Hono<Env>();

export const playlistsRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const user = c.get("user");
    const { page, limit, author, query } = c.req.valid("query");
    const mine = c.req.query("mine") === "true";

    const where: Prisma.PlaylistWhereInput = buildVisibilityFilter(
      user,
      query,
      author,
    );

    if (mine && user) {
      where.authorId = user.id;
    }

    const totalCount = await prisma.playlist.count({ where });

    const suggest = c.req.query("suggest") !== undefined;

    const playlists = await prisma.playlist.findMany({
      where,
      include: suggest
        ? {
            author: true,
          }
        : {
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
            author: true,
          },
      distinct: suggest ? ["title"] : undefined,
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
  .post("/", zValidator("json", PostPlaylistSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const { title, description, visibility, asUserId } = c.req.valid("json");

    let authorId = user.id;
    if (asUserId) {
      if (user.role !== "ADMIN") {
        unauthorized("Only admins can create playlists for other users");
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: asUserId },
      });
      if (!targetUser) {
        badRequest("Target user not found");
      }
      if (targetUser.password !== null) {
        badRequest("Can only create playlists for system accounts");
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
