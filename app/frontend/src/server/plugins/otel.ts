import { definePlugin } from "nitro";
import { initOtelMetrics, recordRequestError } from "../../lib/otel";

export default definePlugin((nitroApp) => {
  const meterProvider = initOtelMetrics();

  if (!meterProvider) {
    return;
  }

  nitroApp.hooks.hook("error", recordRequestError);
  nitroApp.hooks.hook("close", () => meterProvider.shutdown());
});
