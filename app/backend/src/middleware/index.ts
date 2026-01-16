import { HTTPException } from "hono/http-exception";
import { trimTrailingSlash } from "hono/trailing-slash";
import type { HonoApp } from "@/@types/hono";
import { handleAuth } from "./auth";
import { handleCors } from "./cors";

export const registerMiddleware = (app: HonoApp) => {
  // Error handler - convert HTTPException to JSON response
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          status: "error",
          code: err.status,
          message: err.message,
        },
        err.status,
      );
    }
    // For other errors, return 500
    console.error("Unexpected error:", err);
    return c.json(
      {
        status: "error",
        code: 500,
        message: "Internal Server Error",
      },
      500,
    );
  });

  handleCors(app);
  handleAuth(app);
  app.use(trimTrailingSlash());
};
