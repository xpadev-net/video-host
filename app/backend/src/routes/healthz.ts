import type { HonoApp } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

// Kubernetes gives the readiness probe 2 s, so a dependency that hangs must
// be reported as down well before that instead of stalling the response.
const CHECK_TIMEOUT_MS = 1000;

const check = async (probe: () => Promise<unknown>): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("timeout")),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const registerHealthzRoute = (app: HonoApp) => {
  // Liveness: the process answers.
  app.get("/healthz", async (c) => {
    return c.json({
      status: "ok",
    });
  });

  // Readiness: the database is mandatory; Redis only backs uploads/progress,
  // so its outage is reported without taking the whole API out of rotation.
  app.get("/readyz", async (c) => {
    const [database, redis] = await Promise.all([
      check(() => prisma.$queryRaw`SELECT 1`),
      check(async () => (await getRedisClient()).ping()),
    ]);
    return c.json(
      { status: database ? "ok" : "unavailable", database, redis },
      database ? 200 : 503,
    );
  });
};
