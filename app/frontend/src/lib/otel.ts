import { type Counter, metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { CapturedErrorContext } from "nitro/types";

const DEFAULT_SERVICE_NAME = "video-host-frontend";
const EXPORT_INTERVAL_MS = 30_000;

// Instruments must be created after the provider is registered:
// getMeterProvider() is a permanent NoopMeterProvider until then.
let requestErrors: Counter | undefined;
let meterProvider: MeterProvider | undefined;

/**
 * Registers a global MeterProvider pushing OTLP metrics to the collector.
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT or
 * OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set; all exporters/readers resolve
 * their endpoint and headers from the standard OTEL_* env vars.
 */
export const initOtelMetrics = () => {
  if (
    !process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    !process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
  ) {
    return;
  }

  if (meterProvider) {
    return meterProvider;
  }

  meterProvider = new MeterProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]:
          process.env.OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
      }),
    ),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: EXPORT_INTERVAL_MS,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  requestErrors = metrics
    .getMeter(DEFAULT_SERVICE_NAME)
    .createCounter("video_host.frontend.request.errors", {
      description: "Server-side request errors captured by Nitro.",
      unit: "{error}",
    });

  return meterProvider;
};

export const recordRequestError = (
  _error: Error,
  context: CapturedErrorContext,
) => {
  const event = context.event;

  requestErrors?.add(1, {
    "http.request.method": event?.req.method ?? "unknown",
    "url.path": event ? new URL(event.req.url).pathname : "unknown",
    ...(context.tags?.length ? { "error.source": context.tags.join(",") } : {}),
  });
};
