import type { User } from "@prisma/client";
import type { Hono } from "hono";

export type HonoApp = Hono<{
  Variables: {
    user?: User;
  };
}>;
