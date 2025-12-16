import { cors } from "hono/cors";
import type { HonoApp } from "@/@types/hono";
import { CORS_ORIGIN } from "@/env";

export const handleCors = (app: HonoApp) => {
  app.use(
    "/*",
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS", "DELETE", "PUT"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );
};
