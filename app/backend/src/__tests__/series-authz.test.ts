import type { User } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  series: { findUnique: vi.fn() },
  movie: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  movieOnPlaylist: {
    findFirst: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
  },
  playlist: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/s3", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/s3")>()),
  deleteProdFile: vi.fn(),
  deleteTmpFile: vi.fn(),
  tmpFileExists: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/redis", () => ({
  addEncodeJob: vi.fn(),
  setEncodeProgress: vi.fn(),
}));
vi.mock("@/utils/systemAccountCache", () => ({
  isSystemAccount: vi.fn().mockResolvedValue(false),
}));

import { moviesRoute } from "../routes/api/v4/movies";
import { playlistDetailRoute } from "../routes/api/v4/playlists/[playlist]";
import { seriesDetailRoute } from "../routes/api/v4/series/[series]";

const person = (id: string, role: User["role"] = "USER"): User => ({
  id,
  name: id,
  username: id,
  role,
  kind: "HUMAN",
  authUserId: `auth-${id}`,
  avatarUrl: null,
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const alice = person("alice");
const bob = person("bob");

const appFor = (actor?: User) => {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    if (actor) c.set("user", actor);
    await next();
  });
  app.route("/series", seriesDetailRoute);
  app.route("/movies", moviesRoute);
  app.route("/playlists", playlistDetailRoute);
  return app;
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const emptySeries = {
  id: "s1",
  authorId: "alice",
  visibility: "PUBLIC",
  author: alice,
  movies: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  database.series.findUnique.mockResolvedValue(emptySeries);
  database.movie.aggregate.mockResolvedValue({ _max: { order: 0 } });
  database.$transaction.mockImplementation((ops: unknown[]) =>
    Promise.all(ops),
  );
});

describe("series movie association authorization", () => {
  it("rejects adding a movie owned by someone else", async () => {
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      authorId: "bob",
      seriesId: "other",
    });
    const res = await appFor(alice).request(
      "/series/s1/movies",
      json("POST", { movieId: "m1" }),
    );
    expect(res.status).toBe(404);
    expect(database.movie.update).not.toHaveBeenCalled();
  });

  it("adds a movie owned by the caller", async () => {
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      authorId: "alice",
      seriesId: null,
    });
    const res = await appFor(alice).request(
      "/series/s1/movies",
      json("POST", { movieId: "m1" }),
    );
    expect(res.status).toBe(200);
    expect(database.movie.update).toHaveBeenCalledTimes(1);
  });

  it("scopes detaching to the series", async () => {
    database.movie.updateMany.mockResolvedValue({ count: 0 });
    const res = await appFor(alice).request("/series/s1/movies/m9", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(database.movie.updateMany).toHaveBeenCalledWith({
      where: { id: "m9", seriesId: "s1" },
      data: { seriesId: null, order: 0 },
    });
  });

  it("rejects reordering movies outside the series", async () => {
    database.movie.count.mockResolvedValue(1);
    const res = await appFor(alice).request(
      "/series/s1/movies",
      json("PATCH", { movieIds: ["m1", "foreign"] }),
    );
    expect(res.status).toBe(400);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("reorders in a transaction", async () => {
    database.movie.count.mockResolvedValue(2);
    const res = await appFor(alice).request(
      "/series/s1/movies",
      json("PATCH", { movieIds: ["m1", "m2"] }),
    );
    expect(res.status).toBe(200);
    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(database.movie.update).toHaveBeenCalledTimes(2);
  });
});

describe("seriesId on movie create/update", () => {
  it("rejects creating a movie in someone else's series", async () => {
    database.series.findUnique.mockResolvedValue({ authorId: "bob" });
    const res = await appFor(alice).request(
      "/movies",
      json("POST", {
        title: "t",
        s3Key: "uploads/alice/k.mp4",
        seriesId: "s2",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("reports an unknown series as 404 instead of a 500", async () => {
    database.series.findUnique.mockResolvedValue(null);
    const res = await appFor(alice).request(
      "/movies",
      json("POST", {
        title: "t",
        s3Key: "uploads/alice/k.mp4",
        seriesId: "nope",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects moving a movie into someone else's series", async () => {
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      authorId: "alice",
    });
    database.series.findUnique.mockResolvedValue({ authorId: "bob" });
    const res = await appFor(alice).request(
      "/movies/m1",
      json("PATCH", { seriesId: "s2" }),
    );
    expect(res.status).toBe(401);
    expect(database.movie.update).not.toHaveBeenCalled();
  });
});

describe("playlist movie addition", () => {
  const playlist = { id: "p1", authorId: "bob" };

  it("hides other users' private movies", async () => {
    database.playlist.findUnique.mockResolvedValue(playlist);
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      authorId: "alice",
      visibility: "PRIVATE",
      viewers: [],
      variants: [{ status: "READY" }],
    });
    const res = await appFor(bob).request(
      "/playlists/p1/movies",
      json("POST", { movieId: "m1" }),
    );
    expect(res.status).toBe(404);
    expect(database.movieOnPlaylist.create).not.toHaveBeenCalled();
  });
});
