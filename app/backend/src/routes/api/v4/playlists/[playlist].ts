import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterPlaylist } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerPlaylistRoute = (app: HonoApp) => {
  handleGet(app);
  handlePatch(app);
  handleDelete(app);
  handleAddMovie(app);
  handleRemoveMovie(app);
  handleReorderMovies(app);
};

// GET /api/v4/playlists/:playlist
const handleGet = (app: HonoApp) => {
  app.get("/:playlist", async (c) => {
    const id = c.req.param("playlist");
    if (!id) {
      return badRequest(c, "No playlist provided");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id },
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
      if (!user || (user.id !== playlist.authorId && user.role !== "ADMIN")) {
        return notFound(c, "Playlist not found");
      }
    }

    return ok(c, filterPlaylist(playlist));
  });
};

const PatchPlaylistSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: ZVisibility.optional(),
});

// PATCH /api/v4/playlists/:playlist
const handlePatch = (app: HonoApp) => {
  app.patch(
    "/:playlist",
    zValidator("json", PatchPlaylistSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return unauthorized(c, "Unauthorized");
      }

      const id = c.req.param("playlist");
      if (!id) {
        return badRequest(c, "No playlist provided");
      }

      const existing = await prisma.playlist.findUnique({
        where: { id },
      });
      if (!existing) {
        return notFound(c, "Playlist not found");
      }

      const isOwner = existing.authorId === user.id;
      const isAdminForSystem =
        user.role === "ADMIN" && (await isSystemAccount(existing.authorId));

      if (!isOwner && !isAdminForSystem) {
        return unauthorized(c, "Not authorized to edit this playlist");
      }

      const { title, description, visibility } = c.req.valid("json");
      const playlist = await prisma.playlist.update({
        where: { id },
        data: {
          title: title ?? existing.title,
          description: description ?? existing.description,
          visibility: visibility ?? existing.visibility,
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
    },
  );
};

// DELETE /api/v4/playlists/:playlist
const handleDelete = (app: HonoApp) => {
  app.delete("/:playlist", async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }

    const id = c.req.param("playlist");
    if (!id) {
      return badRequest(c, "No playlist provided");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id },
    });
    if (!playlist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystem =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystem) {
      return unauthorized(c, "Not authorized to delete this playlist");
    }

    await prisma.movieOnPlaylist.deleteMany({
      where: { playlistId: id },
    });
    await prisma.playlist.delete({
      where: { id },
    });

    return ok(c, { success: true });
  });
};

const AddMovieSchema = z.object({
  movieId: z.string(),
});

// POST /api/v4/playlists/:playlist/movies
const handleAddMovie = (app: HonoApp) => {
  app.post(
    "/:playlist/movies",
    zValidator("json", AddMovieSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return unauthorized(c, "Unauthorized");
      }

      const playlistId = c.req.param("playlist");
      if (!playlistId) {
        return badRequest(c, "No playlist provided");
      }

      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
      });
      if (!playlist) {
        return notFound(c, "Playlist not found");
      }

      const isOwner = playlist.authorId === user.id;
      const isAdminForSystem =
        user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

      if (!isOwner && !isAdminForSystem) {
        return unauthorized(c, "Not authorized to edit this playlist");
      }

      const { movieId } = c.req.valid("json");

      // Check if movie exists
      const movie = await prisma.movie.findUnique({
        where: { id: movieId },
      });
      if (!movie) {
        return badRequest(c, "Movie not found");
      }

      // Check if already in playlist
      const existing = await prisma.movieOnPlaylist.findUnique({
        where: {
          playlistId_movieId: { playlistId, movieId },
        },
      });
      if (existing) {
        return badRequest(c, "Movie already in playlist");
      }

      // Get max order
      const maxOrder = await prisma.movieOnPlaylist.aggregate({
        where: { playlistId },
        _max: { order: true },
      });

      await prisma.movieOnPlaylist.create({
        data: {
          playlistId,
          movieId,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });

      // Update playlist updatedAt
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { updatedAt: new Date() },
      });

      return ok(c, { success: true });
    },
  );
};

// DELETE /api/v4/playlists/:playlist/movies/:movie
const handleRemoveMovie = (app: HonoApp) => {
  app.delete("/:playlist/movies/:movie", async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }

    const playlistId = c.req.param("playlist");
    const movieId = c.req.param("movie");
    if (!playlistId || !movieId) {
      return badRequest(c, "Invalid parameters");
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      return notFound(c, "Playlist not found");
    }

    const isOwner = playlist.authorId === user.id;
    const isAdminForSystem =
      user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

    if (!isOwner && !isAdminForSystem) {
      return unauthorized(c, "Not authorized to edit this playlist");
    }

    await prisma.movieOnPlaylist.delete({
      where: {
        playlistId_movieId: { playlistId, movieId },
      },
    });

    // Update playlist updatedAt
    await prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });

    return ok(c, { success: true });
  });
};

const ReorderMoviesSchema = z.object({
  movieIds: z.array(z.string()),
});

// PATCH /api/v4/playlists/:playlist/movies
const handleReorderMovies = (app: HonoApp) => {
  app.patch(
    "/:playlist/movies",
    zValidator("json", ReorderMoviesSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return unauthorized(c, "Unauthorized");
      }

      const playlistId = c.req.param("playlist");
      if (!playlistId) {
        return badRequest(c, "No playlist provided");
      }

      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
      });
      if (!playlist) {
        return notFound(c, "Playlist not found");
      }

      const isOwner = playlist.authorId === user.id;
      const isAdminForSystem =
        user.role === "ADMIN" && (await isSystemAccount(playlist.authorId));

      if (!isOwner && !isAdminForSystem) {
        return unauthorized(c, "Not authorized to edit this playlist");
      }

      const { movieIds } = c.req.valid("json");

      // Update order for each movie
      for (let i = 0; i < movieIds.length; i++) {
        await prisma.movieOnPlaylist.updateMany({
          where: { playlistId, movieId: movieIds[i] },
          data: { order: i },
        });
      }

      // Update playlist updatedAt
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { updatedAt: new Date() },
      });

      return ok(c, { success: true });
    },
  );
};

const isSystemAccount = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  return user?.password === null;
};
