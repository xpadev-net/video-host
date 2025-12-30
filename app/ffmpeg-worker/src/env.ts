import "dotenv/config";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Sentinel Configuration (optional)
export const REDIS_SENTINEL_HOSTS = process.env.REDIS_SENTINEL_HOSTS; // e.g., "host1:26379,host2:26379,host3:26379"
export const REDIS_SENTINEL_NAME = process.env.REDIS_SENTINEL_NAME; // e.g., "mymaster"
export const REDIS_SENTINEL_PASSWORD = process.env.REDIS_SENTINEL_PASSWORD;

// S3 Configuration
export const S3_TMP_BUCKET = process.env.S3_TMP_BUCKET || "video-tmp";
export const S3_PROD_BUCKET = process.env.S3_PROD_BUCKET || "video-prod";
export const S3_REGION = process.env.S3_REGION || "ap-northeast-1";
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";
export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

// Backend callback
export const BACKEND_CALLBACK_URL =
  process.env.BACKEND_CALLBACK_URL ||
  "http://localhost:3001/api/v4/callback/encode-complete";
export const CALLBACK_SECRET = process.env.CALLBACK_SECRET || "callback-secret";

// VOD streaming
export const VOD_BASE_URL = process.env.VOD_BASE_URL || "http://localhost:3002";

// Worker settings
export const POLL_INTERVAL_MS = parseInt(
  process.env.POLL_INTERVAL_MS || "5000",
  10,
);
export const TEMP_DIR = process.env.TEMP_DIR || "/tmp/ffmpeg-worker";
export const MIN_DISK_SPACE_GB = parseInt(
  process.env.MIN_DISK_SPACE_GB || "1",
  10,
);
export const JOB_TIMEOUT_SECONDS = parseInt(
  process.env.JOB_TIMEOUT_SECONDS || "7200",
  10,
);
export const FFMPEG_THREADS = process.env.FFMPEG_THREADS
  ? parseInt(process.env.FFMPEG_THREADS, 10)
  : undefined; // undefined means use default (all available CPUs)
