import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { accountsRoute } from "./accounts";
import { authRoute } from "./auth";
import { callbackRoute } from "./callback";
import { invitationsRoute } from "./invitations";
import { moviesRoute } from "./movies";
import { playlistsRoute } from "./playlists";
import { progressRoute } from "./progress";
import { seriesRoute } from "./series";
import { uploadRoute } from "./upload";
import { usersRoute } from "./users";
import { vodRoute } from "./vod";

const app = new Hono<Env>();

export const v4Route = app
  .route("/auth", authRoute)
  .route("/users", usersRoute)
  .route("/movies", moviesRoute)
  .route("/series", seriesRoute)
  .route("/playlists", playlistsRoute)
  .route("/accounts", accountsRoute)
  .route("/invitations", invitationsRoute)
  .route("/upload", uploadRoute)
  .route("/callback", callbackRoute)
  .route("/vod", vodRoute)
  .route("/progress", progressRoute);

export const registerV4Route = (parentApp: HonoApp) => {
  parentApp.route("/v4", v4Route);
};
