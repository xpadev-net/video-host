import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { registerV4Route } from "./v4";

export const registerApiRoute = (app: HonoApp) => {
  const api = new Hono() as HonoApp;
  registerV4Route(api);
  app.route("/api", api);
};
