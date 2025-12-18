import type { User } from "@prisma/client";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { apiRoute } from "./api";
import { registerHealthzRoute } from "./healthz";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

export const appRouter = app.route("/api", apiRoute);
export type AppRouter = typeof appRouter;

export const registerRoute = (app: HonoApp) => {
  registerHealthzRoute(app);
  app.route("/", appRouter);
};
