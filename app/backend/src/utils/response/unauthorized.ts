import { HTTPException } from "hono/http-exception";

export const unauthorized: (message: string) => never = (
  message: string,
): never => {
  throw new HTTPException(401, { message });
};
