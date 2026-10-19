import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import type { HonoApp } from "@/@types/hono";
import { handleAuth } from "./auth";
import { handleCors } from "./cors";
import { handleMetrics } from "./metrics";

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

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

  // Every JSON body is small (files go straight to S3), so cap them before any
  // handler or parser reads the stream.
  app.use(
    "/*",
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_BYTES,
      onError: (c) =>
        c.json(
          { status: "error", code: 413, message: "Payload Too Large" },
          413,
        ),
    }),
  );
  // This is a JSON API consumed cross-origin, so only the safe defaults are
  // used; Cross-Origin-Resource-Policy stays off to not break CORS fetches.
  app.use("/*", secureHeaders({ crossOriginResourcePolicy: false }));

  handleMetrics(app);
  handleCors(app);
  handleAuth(app);
  app.use(trimTrailingSlash());
};
