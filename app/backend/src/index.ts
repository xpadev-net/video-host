import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { PORT } from "@/env";
import { startAuthRateLimitCleanup } from "@/lib/auth-maintenance";
import { startStaleUploadCleanup } from "@/lib/cleanup-stale-uploads";
import { prisma } from "@/lib/prisma";
import { closeRedis } from "@/lib/redis";
import { initializeS3Buckets } from "@/lib/s3";
import { initOtelMetrics, shutdownOtelMetrics } from "@/otel";
import { registerMiddleware } from "./middleware";
import { registerRoute } from "./routes";

initOtelMetrics();

const app = new Hono() as HonoApp;

registerMiddleware(app);

registerRoute(app);

const port = PORT;
let authCleanupTimer: NodeJS.Timeout | undefined;

const startServer = async (): Promise<ServerType> => {
  await initializeS3Buckets();
  authCleanupTimer = startAuthRateLimitCleanup();
  const server = serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Server is running on port ${port}`);
  return server;
};

const serverPromise = startServer();
let cleanupTimer: NodeJS.Timeout | undefined;
void serverPromise.then(() => {
  cleanupTimer = startStaleUploadCleanup();
});
let shuttingDown: Promise<void> | null = null;

const shutdown = (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return shuttingDown;
  shuttingDown = (async () => {
    console.log(`Received ${signal}; shutting down gracefully`);
    if (cleanupTimer) clearInterval(cleanupTimer);
    if (authCleanupTimer) clearInterval(authCleanupTimer);
    try {
      const server = await serverPromise;
      await new Promise<void>((resolve, reject) => {
        const forceCloseTimer = setTimeout(() => {
          console.warn("HTTP drain timed out; closing remaining connections");
          if ("closeAllConnections" in server) {
            server.closeAllConnections();
          }
        }, 45_000);
        forceCloseTimer.unref();
        server.close((error) => {
          clearTimeout(forceCloseTimer);
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      console.error("HTTP server shutdown failed:", error);
    }

    for (const closeResource of [
      () => prisma.$disconnect(),
      closeRedis,
      shutdownOtelMetrics,
    ]) {
      try {
        await closeResource();
      } catch (error) {
        console.error("Resource shutdown failed:", error);
      }
    }
  })();
  return shuttingDown;
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => {
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  });
}

void serverPromise.catch(async (error) => {
  console.error("Backend startup failed:", error);
  process.exitCode = 1;
  await Promise.allSettled([
    prisma.$disconnect(),
    closeRedis(),
    shutdownOtelMetrics(),
  ]);
});
