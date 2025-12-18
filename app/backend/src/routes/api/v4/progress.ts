import type { User } from "@prisma/client";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { HonoApp } from "@/@types/hono";
import { getEncodeProgress, getQueuePosition } from "@/lib/redis";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

// SSE endpoint for encoding progress
export const progressRoute = app.get("/:movieId", async (c) => {
  const movieId = c.req.param("movieId");

  return streamSSE(c, async (stream) => {
    let lastData = "";

    // Poll for updates every 2 seconds
    while (true) {
      const progress = await getEncodeProgress(movieId);

      if (progress) {
        // If queued, get queue position
        if (progress.status === "queued") {
          const position = await getQueuePosition(movieId);
          progress.queuePosition = position;
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

        // Stop streaming if completed or failed
        if (progress.status === "completed" || progress.status === "failed") {
          break;
        }
      }

      // Wait 2 seconds before next poll
      await stream.sleep(2000);
    }
  });
});

export const registerProgressRoute = (app: HonoApp) => {
  app.route("/progress", progressRoute);
};
