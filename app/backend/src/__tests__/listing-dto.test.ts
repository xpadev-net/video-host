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
