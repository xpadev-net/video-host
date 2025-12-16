import type { Context } from "hono";

export const ok = <T>(c: Context, data: T) => {
  return c.json(
    {
      status: "ok",
      code: 200,
      data,
    },
    200,
  );
};
