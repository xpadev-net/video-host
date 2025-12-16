import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { HonoApp } from "@/@types/hono";
import { ZVisibility } from "@/@types/models";
import { filterMovie } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

export const registerMovieRoute = (app: HonoApp) => {
  handleGet(app);
  handlePatch(app);
};

const handleGet = (app: HonoApp) => {
  app.get("/:movie", async (c) => {
    const param = c.req.param("movie");
    if (!param) {
      return badRequest(c, "No movie provided");
    }
    const movie = await prisma.movie.findUnique({
      where: {
        id: param,
      },
      include: {
        author: true,
        series: {
          include: {
            author: true,
            movies: {
              orderBy: [
                {
                  order: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
              include: {
                author: true,
                variants: true,
              },
            },
          },
        },
        variants: true,
      },
    });
    if (!movie) {
      return notFound(c, "Movie not found");
    }

    if (movie.visibility === "PRIVATE") {
      const user = c.get("user");
      if (!user || (user.id !== movie.authorId && user.role !== "ADMIN")) {
        return notFound(c, "Movie not found");
      }
    }

    return ok(c, {
      ...filterMovie(movie),
      isOwner: c.get("user")?.id === movie.authorId,
    });
  });
};

const MoviePatchSchema = z.object({
  title: z.string(),
  description: z.string(),
  seriesId: z.string().optional(),
  visibility: ZVisibility.optional(),
});

const handlePatch = (app: HonoApp) => {
  app.patch("/:movie", zValidator("json", MoviePatchSchema), async (c) => {
    const user = c.get("user");
    if (!user) {
      return unauthorized(c, "Unauthorized");
    }
    const param = c.req.param("movie");
    if (!param) {
      return badRequest(c, "No movie provided");
    }
    {
      const movie = await prisma.movie.findUnique({
        where: {
          id: param,
          authorId: user.id,
        },
      });
      if (!movie) {
        return notFound(c, "Movie not found");
      }
    }
    const { title, description, seriesId, visibility } = c.req.valid("json");
    const movie = await prisma.movie.update({
      where: {
        id: param,
      },
      data: {
        title,
        description,
        seriesId,
        visibility,
      },
      include: {
        author: true,
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
        variants: true,
      },
    });
    return ok(c, filterMovie(movie));
  });
};
