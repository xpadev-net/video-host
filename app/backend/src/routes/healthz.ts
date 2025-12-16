import type { HonoApp } from "@/@types/hono";

export const registerHealthzRoute = (app: HonoApp) => {
  app.get("/healthz", async (c) => {
    return c.json({
      status: "ok",
    });
  });
};
