import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { v4Route } from "./v4";

const app = new Hono<Env>();

export const apiRoute = app.route("/v4", v4Route);

export const registerApiRoute = (parent: HonoApp) => {
  parent.route("/api", apiRoute);
};
