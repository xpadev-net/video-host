import type { Context } from "hono";

export const unauthorized = (c: Context, message: string) => {
  return c.json(
    {
      status: "error",
      code: 401,
      message,
    },
    401,
  );
};
