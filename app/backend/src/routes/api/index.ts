import type { User } from "@prisma/client";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { v4Route } from "./v4";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

export const apiRoute = app.route("/v4", v4Route);

export const registerApiRoute = (parent: HonoApp) => {
  parent.route("/api", apiRoute);
};
