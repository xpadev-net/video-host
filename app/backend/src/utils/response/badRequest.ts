import { HTTPException } from "hono/http-exception";

export const badRequest: (message: string) => never = (
  message: string,
): never => {
  throw new HTTPException(400, { message });
};
