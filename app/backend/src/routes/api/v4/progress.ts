import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Env, HonoApp } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { getEncodeProgress, getQueuePosition } from "@/lib/redis";
import { canManageMovie } from "@/utils/movieAuth";
import { notFound, unauthorized } from "@/utils/response";

const POLL_INTERVAL_MS = 2000;
// Progress keys expire after an hour, so a stream never has reason to outlive it.
const MAX_STREAM_MS = 60 * 60 * 1000;
// Consecutive polls without a progress key (never queued, or expired) before
// the stream is closed instead of polling forever.
const MAX_EMPTY_POLLS = 30;

const app = new Hono<Env>();

// SSE endpoint for encoding progress
export const progressRoute = app.get("/:movieId", async (c) => {
  const user = c.get("user");
  if (!user) {
    unauthorized("Unauthorized");
  }

  const movieId = c.req.param("movieId");
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { authorId: true },
  });
  if (!movie) {
    notFound("Movie not found");
  }
  if (!(await canManageMovie(user, movie.authorId))) {
    unauthorized("Not authorized to view this movie's progress");
  }

  return streamSSE(c, async (stream) => {
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });

    const deadline = Date.now() + MAX_STREAM_MS;
    let lastData = "";
    let emptyPolls = 0;

    // Poll for updates every 2 seconds until the client leaves, the job
    // finishes, or the stream runs out of reasons to stay open.
    while (!aborted && !stream.aborted && Date.now() < deadline) {
      const progress = await getEncodeProgress(movieId);

      if (progress) {
        emptyPolls = 0;

        // If queued, get queue position
        if (progress.status === "queued") {
          progress.queuePosition = await getQueuePosition(movieId);
        }

        const data = JSON.stringify(progress);

        // Only send if data changed
        if (data !== lastData) {
          await stream.writeSSE({
            event: "progress",
            data,
          });
          lastData = data;
        }

        // Stop streaming only if completed or finally failed (not retrying)
        // Continue streaming for queued, processing, and retrying statuses
        if (progress.status === "completed" || progress.status === "failed") {
          break;
        }
      } else if (++emptyPolls >= MAX_EMPTY_POLLS) {
        await stream.writeSSE({ event: "end", data: "" });
        break;
      }

      // Wait before next poll
      await stream.sleep(POLL_INTERVAL_MS);
    }
  });
});

export const registerProgressRoute = (app: HonoApp) => {
  app.route("/progress", progressRoute);
};
