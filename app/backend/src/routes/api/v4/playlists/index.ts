import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  type FormattedPlaylist,
  type PaginatedResponse,
  ZBasicVisibility,
} from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { formatPlaylist } from "@/lib/formatter";
import { prisma } from "@/lib/prisma";
import { getDistinctSuggestPage } from "@/lib/suggest";
import {
  buildMovieAccessWhere,
  buildVisibilityFilter,
} from "@/utils/buildVisibilityFilter";
import { DescriptionSchema, TitleSchema } from "@/utils/inputSchemas";
import { resolveAuthorId } from "@/utils/movieAuth";
import { MAX_RELATION_MOVIES, paginationQuerySchema } from "@/utils/pagination";
import { unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { playlistDetailRoute } from "./[playlist]";

const QuerySchema = paginationQuerySchema().extend({
  author: z.string().optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  suggest: z
    .string()
    .optional()
    .transform((value) => value !== undefined),
  query: z.string().optional(),
});

const PostPlaylistSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema.optional(),
  visibility: ZBasicVisibility.optional().default("PUBLIC"),
  asUserId: z.string().optional(),
});

const app = new Hono<Env>();

export const playlistsRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const user = c.get("user");
    const { page, limit, author, query, mine, suggest } = c.req.valid("query");

    const where: Prisma.PlaylistWhereInput =
      buildVisibilityFilter<Prisma.PlaylistWhereInput>(user, query, author);

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
        table: "Playlist",
        user,
        query,
        authorId,
        page,
        limit,
      });
      const rows = ids.length
        ? await prisma.playlist.findMany({
            where: { id: { in: ids } },
            include: { author: true },
          })
        : [];
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const items = ids.flatMap((id) => {
        const row = rowsById.get(id);
        return row ? [formatPlaylist(filterPlaylist(row))] : [];
      });
      const totalPages = Math.ceil(totalCount / limit);

      const response: PaginatedResponse<FormattedPlaylist> = {
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

    const totalCount = await prisma.playlist.count({ where });

    const playlists = await prisma.playlist.findMany({
      where,
      include: {
        movies: {
          where: { movie: buildMovieAccessWhere(user) },
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
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: PaginatedResponse<FormattedPlaylist> = {
      items: playlists.map((p) => formatPlaylist(filterPlaylist(p))),
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

    const authorId = await resolveAuthorId(user, asUserId);

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
          where: { movie: buildMovieAccessWhere(user) },
          orderBy: { order: "asc" },
          take: MAX_RELATION_MOVIES,
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

    return ok(c, formatPlaylist(filterPlaylist(playlist)));
  })
  .route("/", playlistDetailRoute);

export const registerPlaylistsRoutes = (app: HonoApp) => {
  app.route("/playlists", playlistsRoute);
};
