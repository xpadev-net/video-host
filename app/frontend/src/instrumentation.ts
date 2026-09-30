import type { Instrumentation } from "next";

// Imported lazily so the Node-only OTel SDK never lands in the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initOtelMetrics } = await import("./lib/otel");
    initOtelMetrics();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordRequestError } = await import("./lib/otel");
    await recordRequestError(error, request, context);
  }
};
