import type { User } from "@prisma/client";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { authRoute } from "./auth";
import { callbackRoute } from "./callback";
import { moviesRoute } from "./movies";
import { playlistsRoute } from "./playlists";
import { progressRoute } from "./progress";
import { seriesRoute } from "./series";
import { systemAccountsRoute } from "./system-accounts";
import { uploadRoute } from "./upload";
import { usersRoute } from "./users";
import { vodRoute } from "./vod";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

export const v4Route = app
  .route("/auth", authRoute)
  .route("/users", usersRoute)
  .route("/movies", moviesRoute)
  .route("/series", seriesRoute)
  .route("/playlists", playlistsRoute)
  .route("/system-accounts", systemAccountsRoute)
  .route("/upload", uploadRoute)
  .route("/callback", callbackRoute)
  .route("/vod", vodRoute)
  .route("/progress", progressRoute);

export const registerV4Route = (parentApp: HonoApp) => {
  parentApp.route("/v4", v4Route);
};
