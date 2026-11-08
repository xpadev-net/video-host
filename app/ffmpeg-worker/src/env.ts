import "dotenv/config";
import { availableParallelism } from "node:os";
import { parseWorkerEnv } from "./config";
import { log } from "./logger";

const env = parseWorkerEnv(process.env, Math.min(2, availableParallelism()));
if (process.env.NODE_ENV === "development" && !process.env.CALLBACK_SECRET) {
  log.warn("CALLBACK_SECRET not set, using the development default");
}

export const REDIS_URL = env.REDIS_URL;
export const REDIS_SENTINEL_HOSTS = env.REDIS_SENTINEL_HOSTS;
export const REDIS_SENTINEL_NAME = env.REDIS_SENTINEL_NAME;
export const REDIS_SENTINEL_PASSWORD = env.REDIS_SENTINEL_PASSWORD;
export const REDIS_NODE_PASSWORD = env.REDIS_NODE_PASSWORD;

export const S3_TMP_BUCKET = env.S3_TMP_BUCKET;
export const S3_PROD_BUCKET = env.S3_PROD_BUCKET;
export const S3_REGION = env.S3_REGION;
export const S3_ACCESS_KEY_ID = env.S3_ACCESS_KEY_ID;
export const S3_SECRET_ACCESS_KEY = env.S3_SECRET_ACCESS_KEY;
export const S3_ENDPOINT = env.S3_ENDPOINT;
export const S3_FORCE_PATH_STYLE = env.S3_FORCE_PATH_STYLE;

export const BACKEND_BASE_URL = env.BACKEND_BASE_URL;
export const CALLBACK_SECRET = env.CALLBACK_SECRET;

export const VOD_BASE_URL = env.VOD_BASE_URL;
export const getVodContentUrl = (s3Key: string): string => {
  const origin = VOD_BASE_URL.replace(/\/+$/, "").replace(/\/vod$/i, "");
  const encodedKey = s3Key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/vod/${encodedKey}/master.m3u8`;
};

export const POLL_INTERVAL_MS = env.POLL_INTERVAL_MS;
export const TEMP_DIR = env.TEMP_DIR;
export const MIN_DISK_SPACE_GB = env.MIN_DISK_SPACE_GB;
export const JOB_TIMEOUT_SECONDS = env.JOB_TIMEOUT_SECONDS;
export const FFMPEG_THREADS = env.FFMPEG_THREADS;

export const OTEL_EXPORTER_OTLP_ENDPOINT = env.OTEL_EXPORTER_OTLP_ENDPOINT;
export const OTEL_EXPORTER_OTLP_METRICS_ENDPOINT =
  env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
export const OTEL_SERVICE_NAME = env.OTEL_SERVICE_NAME;
