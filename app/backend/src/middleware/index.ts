import { trimTrailingSlash } from "hono/trailing-slash";
import type { HonoApp } from "@/@types/hono";
import { handleAuth } from "./auth";
import { handleCors } from "./cors";

export const registerMiddleware = (app: HonoApp) => {
  handleCors(app);
  handleAuth(app);
  app.use(trimTrailingSlash());
};
