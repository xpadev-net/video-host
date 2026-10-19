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
import {
  buildMovieAccessWhere,
  buildVisibilityFilter,
} from "@/utils/buildVisibilityFilter";
import { DescriptionSchema, TitleSchema } from "@/utils/inputSchemas";
import { resolveAuthorId } from "@/utils/movieAuth";
import { paginationQuerySchema } from "@/utils/pagination";
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

    const where: Prisma.PlaylistWhereInput = buildVisibilityFilter(
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
      ? await prisma.playlist.groupBy({
          by: ["title"],
          where,
          _max: { id: true, updatedAt: true },
          orderBy: { _max: { updatedAt: "desc" } },
          take: limit,
          skip: (page - 1) * limit,
        })
      : null;
    const totalCount = suggest
      ? (await prisma.playlist.groupBy({ by: ["title"], where })).length
      : await prisma.playlist.count({ where });
    const pageIds = (titleGroups ?? []).flatMap((g) => g._max.id ?? []);

    const playlists = await prisma.playlist.findMany({
      where: titleGroups ? { id: { in: pageIds } } : where,
      include: suggest
        ? {
            author: true,
          }
        : {
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
      ...(titleGroups ? {} : { take: limit, skip: (page - 1) * limit }),
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
