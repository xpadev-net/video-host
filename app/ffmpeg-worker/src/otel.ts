import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  OTEL_SERVICE_NAME,
} from "./env";

const DEFAULT_SERVICE_NAME = "video-host-ffmpeg-worker";
const EXPORT_INTERVAL_MS = 30_000;

// getMeterProvider() returns a permanent NoopMeterProvider until
// initOtelMetrics() registers the real one, so callers must obtain the meter
// after init (a NoopMeter while export is disabled).
export const getMeter = () => metrics.getMeter(DEFAULT_SERVICE_NAME);

/**
 * Registers a global MeterProvider pushing OTLP metrics to the collector.
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT or
 * OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set; all exporters/readers resolve
 * their endpoint and headers from the standard OTEL_* env vars.
 */
export const initOtelMetrics = () => {
  if (!OTEL_EXPORTER_OTLP_ENDPOINT && !OTEL_EXPORTER_OTLP_METRICS_ENDPOINT) {
    return;
  }

  const provider = new MeterProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
      }),
    ),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: EXPORT_INTERVAL_MS,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(provider);

  return provider;
};
