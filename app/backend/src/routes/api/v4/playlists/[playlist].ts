import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";
import { isSystemAccount } from "@/utils/systemAccountCache";

const app = new Hono<Env>();

const PlaylistPatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: ZVisibility.optional(),
});

const AddMovieSchema = z.object({
  movieId: z.string(),
});

const ReorderMoviesSchema = z.object({
  movieIds: z.array(z.string()),
});

export const playlistDetailRoute = app
  .get("/:playlist", async (c) => {
    const playlistId = c.req.param("playlist");
    if (!playlistId) {
      notFound("Playlist not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: {
        id: playlistId,
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

    if (!playlist) {
      notFound("Playlist not found");
    }

    if (playlist.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || user.id !== playlist.authorId) {
        notFound("Playlist not found");
      }
    }

    return ok(c, {
      ...filterPlaylist(playlist),
      isOwner: c.get("user")?.id === playlist.authorId,
    });
  })
  .patch("/:playlist", zValidator("json", PlaylistPatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("playlist");
    if (!param) {
      notFound("Playlist not found");
    }

    const existingPlaylist = await prisma.playlist.findUnique({
      where: { id: param },
    });
    if (!existingPlaylist) {
      notFound("Playlist not found");
    }

    const isOwner = existingPlaylist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" &&
      (await isSystemAccount(existingPlaylist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this playlist");
    }

    const { title, description, visibility } = c.req.valid("json");
    const playlist = await prisma.playlist.update({
      where: {
        id: param,
      },
      data: {
        title: title ?? existingPlaylist.title,
        description: description ?? existingPlaylist.description,
        visibility: visibility ?? existingPlaylist.visibility,
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
  .delete("/:playlist", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }
    const param = c.req.param("playlist");
    if (!param) {
      notFound("Playlist not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: param },
    });
    if (!playlist) {
      notFound("Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to delete this playlist");
    }

    await prisma.movieOnPlaylist.deleteMany({
      where: { playlistId: param },
    });

    await prisma.playlist.delete({
      where: { id: param },
    });

    return ok(c, { success: true });
  })
  .post("/:playlist/movies", zValidator("json", AddMovieSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const playlistId = c.req.param("playlist");
    if (!playlistId) {
      notFound("Playlist not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      notFound("Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this playlist");
    }

    const { movieId } = c.req.valid("json");

    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
    });
    if (!movie) {
      notFound("Movie not found");
    }

    const existingEntry = await prisma.movieOnPlaylist.findFirst({
      where: {
        playlistId,
        movieId,
      },
    });

    if (existingEntry) {
      badRequest("Movie is already in this playlist");
    }

    const maxOrder = await prisma.movieOnPlaylist.aggregate({
      where: { playlistId },
      _max: { order: true },
    });

    await prisma.movieOnPlaylist.create({
      data: {
        playlistId,
        movieId,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    const updatedPlaylist = await prisma.playlist.findUnique({
      where: { id: playlistId },
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

    if (!updatedPlaylist) {
      notFound("Playlist not found");
    }

    return ok(c, filterPlaylist(updatedPlaylist));
  })
  .delete("/:playlist/movies/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      unauthorized("Unauthorized");
    }

    const playlistId = c.req.param("playlist");
    const movieId = c.req.param("movie");
    if (!playlistId || !movieId) {
      notFound("Not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      notFound("Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      unauthorized("Not authorized to edit this playlist");
    }

    await prisma.movieOnPlaylist.deleteMany({
      where: {
        playlistId,
        movieId,
      },
    });

    return ok(c, { success: true });
  })
  .patch(
    "/:playlist/movies",
    zValidator("json", ReorderMoviesSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        unauthorized("Unauthorized");
      }

      const playlistId = c.req.param("playlist");
      if (!playlistId) {
        notFound("Playlist not found");
      }

      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
      });
      if (!playlist) {
        notFound("Playlist not found");
      }

      const isOwner = playlist.authorId === user.id;
      const isAdminForSystemAccount =
        user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

      if (!isOwner && !isAdminForSystemAccount) {
        unauthorized("Not authorized to edit this playlist");
      }

      const { movieIds } = c.req.valid("json");

      await Promise.all(
        movieIds.map((movieId, index) =>
          prisma.movieOnPlaylist.updateMany({
            where: {
              playlistId,
              movieId,
            },
            data: { order: index + 1 },
          }),
        ),
      );

      const updatedPlaylist = await prisma.playlist.findUnique({
        where: { id: playlistId },
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

      if (!updatedPlaylist) {
        notFound("Playlist not found");
      }

      return ok(c, filterPlaylist(updatedPlaylist));
    },
  );

export const registerPlaylistRoute = (app: HonoApp) => {
  app.route("/", playlistDetailRoute);
};
