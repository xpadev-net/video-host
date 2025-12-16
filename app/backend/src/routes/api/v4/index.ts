import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { registerMoviesRoutes } from "@/routes/api/v4/movies";
import { registerPlaylistsRoutes } from "@/routes/api/v4/playlists";
import { registerSeriesRoutes } from "@/routes/api/v4/series";
import { registerSystemAccountsRoute } from "@/routes/api/v4/system-accounts";
import { registerUsersRoute } from "@/routes/api/v4/users";
import { registerAuthRoute } from "./auth";
import { registerCallbackRoute } from "./callback";
import { registerUploadRoute } from "./upload";
import { registerVodRoute } from "./vod";

export const registerV4Route = (app: HonoApp) => {
  const v4 = new Hono() as HonoApp;
  registerAuthRoute(v4);
  registerUsersRoute(v4);
  registerSeriesRoutes(v4);
  registerMoviesRoutes(v4);
  registerPlaylistsRoutes(v4);
  registerSystemAccountsRoute(v4);
  registerUploadRoute(v4);
  registerCallbackRoute(v4);
  registerVodRoute(v4);
  app.route("/v4", v4);
};
