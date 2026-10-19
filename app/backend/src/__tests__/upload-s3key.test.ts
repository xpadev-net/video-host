import type { User } from "@prisma/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../@types/hono";

const database = vi.hoisted(() => ({
  movie: { create: vi.fn(), findUnique: vi.fn() },
  movieVariant: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  series: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}));
const s3 = vi.hoisted(() => ({
  getTmpFileSize: vi.fn(),
  deleteTmpFile: vi.fn().mockResolvedValue(undefined),
  getPresignedUploadUrl: vi.fn().mockResolvedValue("https://s3.test/put"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: database }));
vi.mock("@/lib/redis", () => ({
  addEncodeJob: vi.fn(),
  setEncodeProgress: vi.fn(),
}));
vi.mock("@/lib/s3", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/s3")>()),
  ...s3,
  deleteProdFile: vi.fn(),
}));
vi.mock("@/utils/systemAccountCache", () => ({
  isSystemAccount: vi.fn().mockResolvedValue(false),
}));

import { generateUploadKey } from "../lib/s3";
import { moviesRoute } from "../routes/api/v4/movies";
import { uploadRoute } from "../routes/api/v4/upload";

const alice: User = {
  id: "alice",
  name: "alice",
  username: "alice",
  role: "USER",
  kind: "HUMAN",
  authUserId: "auth-alice",
  avatarUrl: null,
  externalId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const app = new Hono<Env>();
app.use("*", async (c, next) => {
  c.set("user", alice);
  await next();
});
app.route("/movies", moviesRoute);
app.route("/upload", uploadRoute);

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  s3.getTmpFileSize.mockResolvedValue(1024);
  database.movieVariant.findFirst.mockResolvedValue(null);
});

describe("generateUploadKey", () => {
  it("is unique per call and keeps only a sanitized extension", () => {
    const a = generateUploadKey("u1", "日本語.MP4");
    const b = generateUploadKey("u1", "日本語.MP4");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^uploads\/u1\/[0-9a-f-]{36}\.mp4$/);
  });

  it("stays within the DB column for very long filenames", () => {
    expect(generateUploadKey("u1", `${"a".repeat(2000)}.mp4`).length).toBe(
      "uploads/u1/".length + 36 + 4,
    );
  });
});

describe("POST /movies s3Key validation", () => {
  const body = (s3Key: string) => ({ title: "t", s3Key });

  it("rejects another user's upload key", async () => {
    const res = await post("/movies", body("uploads/bob/abc.mp4"));
    expect(res.status).toBe(400);
    expect(database.movie.create).not.toHaveBeenCalled();
  });

  it("rejects path traversal out of the user's prefix", async () => {
    const res = await post("/movies", body("uploads/alice/../bob/abc.mp4"));
    expect(res.status).toBe(400);
  });

  it("rejects a key that does not exist in the tmp bucket", async () => {
    s3.getTmpFileSize.mockResolvedValue(null);
    const res = await post("/movies", body("uploads/alice/abc.mp4"));
    expect(res.status).toBe(400);
    expect(database.movie.create).not.toHaveBeenCalled();
  });
});

describe("POST /movies upload guards", () => {
  const body = { title: "t", s3Key: "uploads/alice/abc.mp4" };

  it("rejects oversized objects and removes them", async () => {
    s3.getTmpFileSize.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    const res = await post("/movies", body);
    expect(res.status).toBe(400);
    expect(s3.deleteTmpFile).toHaveBeenCalledWith(body.s3Key);
    expect(database.movie.create).not.toHaveBeenCalled();
  });

  it("rejects a key already backing another variant", async () => {
    database.movieVariant.findFirst.mockResolvedValue({ id: "v1" });
    const res = await post("/movies", body);
    expect(res.status).toBe(400);
    expect(database.movie.create).not.toHaveBeenCalled();
  });
});

describe("upload validation", () => {
  it("requires the file size so the presigned URL can be bound to it", async () => {
    const res = await post("/upload/init", {
      filename: "a.mp4",
      contentType: "video/mp4",
    });
    expect(res.status).toBe(400);
  });

  it("rejects sizes above the limit", async () => {
    const res = await post("/upload/init", {
      filename: "a.mp4",
      contentType: "video/mp4",
      size: Number.MAX_SAFE_INTEGER,
    });
    expect(res.status).toBe(400);
  });

  it("no longer exposes the legacy presigned-url endpoint", async () => {
    const res = await post("/upload/presigned-url", {
      filename: "a.mp4",
      contentType: "video/mp4",
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-video content types", async () => {
    const res = await post("/upload/init", {
      filename: "a.html",
      contentType: "text/html",
      size: 10,
    });
    expect(res.status).toBe(400);
  });

  it("rejects overly long filenames", async () => {
    const res = await post("/upload/init", {
      filename: `${"a".repeat(300)}.mp4`,
      contentType: "video/mp4",
    });
    expect(res.status).toBe(400);
  });

  it("rejects and removes oversized uploads on complete", async () => {
    database.movie.findUnique.mockResolvedValue({
      id: "m1",
      authorId: "alice",
      variants: [
        { id: "v1", status: "UPLOADING", s3Key: "uploads/alice/x.mp4" },
      ],
    });
    s3.getTmpFileSize.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    const res = await post("/upload/m1/complete", {});
    expect(res.status).toBe(400);
    expect(s3.deleteTmpFile).toHaveBeenCalledWith("uploads/alice/x.mp4");
    expect(database.movieVariant.updateMany).not.toHaveBeenCalled();
  });
});
