import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  series: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  playlist: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/utils/systemAccountCache", () => ({
  isSystemAccount: vi.fn().mockResolvedValue(false),
}));

import { playlistsRoute } from "../routes/api/v4/playlists";
import { seriesRoute } from "../routes/api/v4/series";

const app = new Hono<Env>();
app.route("/series", seriesRoute);
app.route("/playlists", playlistsRoute);

const author = {
  id: "a",
  name: "A",
  username: "a",
  role: "USER",
  avatarUrl: null,
};
const movie = {
  id: "m1",
  title: "m",
  description: null,
  duration: 1,
  variants: [],
  thumbnailUrl: null,
  visibility: "PUBLIC",
  author,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("suggest listings group titles in the database", () => {
  it.each(["series", "playlist"] as const)("%s", async (model) => {
    database[model].groupBy
      .mockResolvedValueOnce([{ title: "x", _max: { id: "id-x" } }])
      .mockResolvedValueOnce([{ title: "x" }, { title: "y" }]);
    database[model].findMany.mockResolvedValue([]);
    const path = model === "series" ? "/series" : "/playlists";
    const res = await app.request(`${path}?suggest&limit=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(database[model].count).not.toHaveBeenCalled();
    // The page is the DB-grouped ids, with no in-memory `distinct`.
    const query = database[model].findMany.mock.calls[0][0];
    expect(query.where).toEqual({ id: { in: ["id-x"] } });
    expect(query.distinct).toBeUndefined();
    expect(body.data.pagination).toMatchObject({
      totalCount: 2,
      totalPages: 2,
      hasNext: true,
    });
  });

  it("uses a plain count and normal paging without suggest", async () => {
    database.series.count.mockResolvedValue(5);
    database.series.findMany.mockResolvedValue([]);
    const res = await app.request("/series");
    expect((await res.json()).data.pagination.totalCount).toBe(5);
    expect(database.series.groupBy).not.toHaveBeenCalled();
    expect(database.series.findMany.mock.calls[0][0]).toMatchObject({
      take: 100,
      skip: 0,
    });
  });
});

describe("listing DTOs are formatted consistently", () => {
  it("serialises nested movie dates as strings in series and playlists", async () => {
    database.series.count.mockResolvedValue(1);
    database.series.findMany.mockResolvedValue([
      {
        id: "s",
        title: "s",
        description: null,
        visibility: "PUBLIC",
        author,
        movies: [movie],
      },
    ]);
    database.playlist.count.mockResolvedValue(1);
    database.playlist.findMany.mockResolvedValue([
      {
        id: "p",
        title: "p",
        description: null,
        visibility: "PUBLIC",
        author,
        movies: [{ movie }],
      },
    ]);
    const series = await (await app.request("/series")).json();
    const playlists = await (await app.request("/playlists")).json();
    expect(series.data.items[0].movies[0].createdAt).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(playlists.data.items[0].movies[0].createdAt).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });
});
