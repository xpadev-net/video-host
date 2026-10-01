import { HTTPException } from "hono/http-exception";

export const forbidden: (message: string) => never = (
  message: string,
): never => {
  throw new HTTPException(403, { message });
};
