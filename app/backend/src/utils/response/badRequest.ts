import type { Context } from "hono";

export const badRequest = (c: Context, message: string) => {
  return c.json(
    {
      status: "error",
      code: 400,
      message,
    },
    400,
  );
};
