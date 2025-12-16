import type { HonoApp } from "@/@types/hono";
import { registerApiRoute } from "./api";
import { registerHealthzRoute } from "./healthz";

export const registerRoute = (app: HonoApp) => {
  registerHealthzRoute(app);
  registerApiRoute(app);
};
