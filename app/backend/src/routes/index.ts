import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { apiRoute } from "./api";
import { registerHealthzRoute } from "./healthz";

const app = new Hono<Env>();

export const appRouter = app.route("/api", apiRoute);
export type AppRouter = typeof appRouter;

export const registerRoute = (app: HonoApp) => {
  registerHealthzRoute(app);
  app.route("/", appRouter);
};
