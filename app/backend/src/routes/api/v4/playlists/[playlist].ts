import { zValidator } from "@hono/zod-validator";
import type { User } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

type Env = {
  Variables: {
    user?: User;
  };
};

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
      return notFound(c, "Playlist not found");
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
      return notFound(c, "Playlist not found");
    }

    if (playlist.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || user.id !== playlist.authorId) {
        return notFound(c, "Playlist not found");
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
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("playlist");
    if (!param) {
      return notFound(c, "Playlist not found");
    }

    const existingPlaylist = await prisma.playlist.findUnique({
      where: { id: param },
    });
    if (!existingPlaylist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = existingPlaylist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" &&
      (await isSystemAccount(existingPlaylist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to edit this playlist");
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
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("playlist");
    if (!param) {
      return notFound(c, "Playlist not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: param },
    });
    if (!playlist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to delete this playlist");
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
      return unauthorized(c, "Unauthorized");
    }

    const playlistId = c.req.param("playlist");
    if (!playlistId) {
      return notFound(c, "Playlist not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to edit this playlist");
    }

    const { movieId } = c.req.valid("json");

    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
    });
    if (!movie) {
      return notFound(c, "Movie not found");
    }

    const existingEntry = await prisma.movieOnPlaylist.findFirst({
      where: {
        playlistId,
        movieId,
      },
    });

    if (existingEntry) {
      return badRequest(c, "Movie is already in this playlist");
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
      return notFound(c, "Playlist not found");
    }

    return ok(c, filterPlaylist(updatedPlaylist));
  })
  .delete("/:playlist/movies/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }

    const playlistId = c.req.param("playlist");
    const movieId = c.req.param("movie");
    if (!playlistId || !movieId) {
      return notFound(c, "Not found");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystemAccount =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystemAccount) {
      return unauthorized(c, "Not authorized to edit this playlist");
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
        return unauthorized(c, "Unauthorized");
      }

      const playlistId = c.req.param("playlist");
      if (!playlistId) {
        return notFound(c, "Playlist not found");
      }

      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
      });
      if (!playlist) {
        return notFound(c, "Playlist not found");
      }

      const isOwner = playlist.authorId === user.id;
      const isAdminForSystemAccount =
        user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

      if (!isOwner && !isAdminForSystemAccount) {
        return unauthorized(c, "Not authorized to edit this playlist");
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
        return notFound(c, "Playlist not found");
      }

      return ok(c, filterPlaylist(updatedPlaylist));
    },
  );

export const registerPlaylistRoute = (app: HonoApp) => {
  app.route("/", playlistDetailRoute);
};

const isSystemAccount = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  return user?.password === null;
};
