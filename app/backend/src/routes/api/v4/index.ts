import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { registerMoviesRoutes } from "@/routes/api/v4/movies";
import { registerSeriesRoutes } from "@/routes/api/v4/series";
import { registerUsersRoute } from "@/routes/api/v4/users";
import { registerAuthRoute } from "./auth";

export const registerV4Route = (app: HonoApp) => {
  const v4 = new Hono() as HonoApp;
  registerAuthRoute(v4);
  registerUsersRoute(v4);
  registerSeriesRoutes(v4);
  registerMoviesRoutes(v4);
  app.route("/v4", v4);
};
