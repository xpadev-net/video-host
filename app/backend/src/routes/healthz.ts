import type { HonoApp } from "@/@types/hono";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

const check = async (probe: () => Promise<unknown>): Promise<boolean> => {
  try {
    await probe();
    return true;
  } catch {
    return false;
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
