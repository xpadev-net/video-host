import type { Context } from "hono";

export const notFound = (c: Context, message: string) => {
  return c.json(
    {
      status: "error",
      code: 404,
      message,
    },
    404,
  );
};
