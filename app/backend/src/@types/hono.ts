import type { User } from "@prisma/client";
import type { Hono } from "hono";

export type Env = {
  Variables: {
    user?: User;
    authUserId?: string;
  };
};

export type HonoApp = Hono<Env>;
