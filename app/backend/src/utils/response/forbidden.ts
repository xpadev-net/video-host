import type { Context } from "hono";

export const forbidden = (c: Context, message: string) => {
  return c.json(
    {
      status: "error",
      code: 403,
      message,
    },
    403,
  );
};
