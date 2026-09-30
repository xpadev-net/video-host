import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import type { HonoApp } from "@/@types/hono";
import { getMeter } from "@/otel";

export const handleMetrics = (app: HonoApp) => {
  const meter = getMeter();
  const requestDuration = meter.createHistogram(
    "http.server.request.duration",
    {
      description: "Duration of HTTP server requests.",
      unit: "s",
    },
  );
  const activeRequests = meter.createUpDownCounter(
    "http.server.active_requests",
    {
      description: "Number of active HTTP server requests.",
      unit: "{request}",
    },
  );

  app.use(
    "/*",
    createMiddleware(async (c, next) => {
      const method = c.req.method;
      const startedAt = performance.now();
      let status = 500;
      activeRequests.add(1, { "http.request.method": method });
      try {
        await next();
        status = c.res.status;
      } catch (err) {
        // onError converts thrown HTTPExceptions into responses after this
        // middleware's finally block, so capture the status here.
        status = err instanceof HTTPException ? err.status : 500;
        throw err;
      } finally {
        activeRequests.add(-1, { "http.request.method": method });
        requestDuration.record((performance.now() - startedAt) / 1000, {
          "http.request.method": method,
          // Last matched route pattern (e.g. /api/v4/movies/:movie). Requests that
          // hit no endpoint fall back to the "/*" middleware route, so raw URLs
          // never become label values.
          "http.route": routePath(c, -1) || "unknown",
          "http.response.status_code": status,
        });
      }
    }),
  );
};
