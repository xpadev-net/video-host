import { getDiskSpace } from "./disk";
import { log } from "./logger";
import { initOtelMetrics } from "./otel";
import { getQueueDepths } from "./queue";

const meter = initOtelMetrics();

export const encodeJobs = meter.createCounter("video_host.encode.jobs", {
  description: "Encode jobs processed, by terminal result.",
  unit: "{job}",
});
export const encodeJobDuration = meter.createHistogram(
  "video_host.encode.job.duration",
  {
    description: "Time spent processing one encode job.",
    unit: "s",
  },
);
export const encodeStageDuration = meter.createHistogram(
  "video_host.encode.stage.duration",
  { description: "Time spent in each encode stage.", unit: "s" },
);
export const encodeInputBytes = meter.createHistogram(
  "video_host.encode.input.size",
  { description: "Input media size in bytes.", unit: "By" },
);
export const ffmpegSpeed = meter.createHistogram("video_host.encode.speed", {
  description: "FFmpeg encoding speed relative to realtime.",
  unit: "x",
});
export const callbackFailures = meter.createCounter(
  "video_host.encode.callback.failures",
  { description: "Failed backend callbacks.", unit: "{callback}" },
);
export const reaperEvents = meter.createCounter(
  "video_host.encode.reaper.events",
  {
    description: "Processing claims recovered by the reaper.",
    unit: "{claim}",
  },
);
export const retryQueueMoved = meter.createCounter(
  "video_host.encode.queue.moved",
  {
    description: "Jobs moved from the retry queue back to the main queue.",
    unit: "{job}",
  },
);

const diskSpace = meter.createObservableGauge("video_host.worker.disk.bytes", {
  description: "Available and total scratch filesystem bytes.",
  unit: "By",
});
meter
  .createObservableGauge("video_host.encode.queue.depth", {
    description: "Jobs waiting in the encode queues.",
    unit: "{job}",
  })
  .addCallback(async (observableResult) => {
    try {
      const { main, retry, processing } = await getQueueDepths();
      observableResult.observe(main, { queue: "main" });
      observableResult.observe(retry, { queue: "retry" });
      observableResult.observe(processing, { queue: "processing" });
    } catch (error) {
      log.error("Failed to observe encode queue depth:", error);
    }
  });

diskSpace.addCallback(async (observableResult) => {
  try {
    const disk = await getDiskSpace();
    observableResult.observe(disk.availableBytes, {
      resource: "scratch",
      state: "available",
    });
    observableResult.observe(disk.totalBytes, {
      resource: "scratch",
      state: "total",
    });
  } catch (error) {
    log.error("Failed to observe scratch disk space:", error);
  }
});
