import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { PORT } from "@/env";
import { initializeS3Buckets } from "@/lib/s3";
import { registerMiddleware } from "./middleware";
import { registerRoute } from "./routes";

const app = new Hono() as HonoApp;

registerMiddleware(app);

registerRoute(app);

const port = PORT;

// Initialize S3 buckets and start server
const startServer = async () => {
  await initializeS3Buckets();

  console.log(`Server is running on port ${port}`);

  serve({
    fetch: app.fetch,
    port,
  });
};

startServer();
