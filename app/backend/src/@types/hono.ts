import type { Hono } from "hono";
import type { User } from "@/@types/account";

export type Env = {
  Variables: {
    user?: User;
    account?: { id: string; name: string; role: "USER" | "ADMIN" };
    authUserId?: string;
    accountId?: string;
  };
};

export type HonoApp = Hono<Env>;
