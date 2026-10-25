import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  OTEL_SERVICE_NAME,
} from "./env";

const DEFAULT_SERVICE_NAME = "video-host-ffmpeg-worker";
const EXPORT_INTERVAL_MS = 30_000;
let meterProvider: MeterProvider | undefined;

/**
 * Registers a global MeterProvider pushing OTLP metrics to the collector.
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT or
 * OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set; all exporters/readers resolve
 * their endpoint and headers from the standard OTEL_* env vars.
 */
export const initOtelMetrics = () => {
  const readers =
    OTEL_EXPORTER_OTLP_ENDPOINT || OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: EXPORT_INTERVAL_MS,
          }),
        ]
      : [];
  const provider = new MeterProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
        "service.version": process.env.COMMIT_HASH || "unknown",
      }),
    ),
    readers,
    views: [
      {
        instrumentName: "video_host.encode.job.duration",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: {
            boundaries: [10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200],
          },
        },
      },
      {
        instrumentName: "video_host.encode.stage.duration",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: {
            boundaries: [1, 5, 10, 30, 60, 120, 300, 600, 1200, 3600],
          },
        },
      },
    ],
  });
  meterProvider = provider;
  metrics.setGlobalMeterProvider(provider);
  return provider.getMeter(OTEL_SERVICE_NAME ?? DEFAULT_SERVICE_NAME);
};

export const shutdownOtelMetrics = async (): Promise<void> => {
  await meterProvider?.shutdown();
};
