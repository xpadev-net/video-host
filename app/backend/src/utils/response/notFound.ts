import { HTTPException } from "hono/http-exception";

export const notFound: (message: string) => never = (
  message: string,
): never => {
  throw new HTTPException(404, { message });
};
