import "dotenv/config";
import * as process from "node:process";

export const PUBLIC_ENDPOINTS = process.env.PUBLIC_ENDPOINTS?.split(",") ?? [];
export const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(",") ?? [];
export const PASSWORD_SALT = process.env.PASSWORD_SALT || "passwordsalt";
export const PASSWORD_HASH_ROUNDS = parseInt(
  process.env.PASSWORD_HASH_ROUNDS || "10",
  10,
);
export const TOKEN_EXPIRY =
  parseInt(process.env.TOKEN_EXPIRY || "604800", 10) * 1000; //convert seconds to milliseconds
export const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED === "true";
export const SIGNUP_CODE = process.env.SIGNUP_CODE;
export const PORT = parseInt(process.env.PORT || "3000", 10);
export const JWT_SECRET = process.env.JWT_SECRET || "secret";

// S3 Configuration
export const S3_TMP_BUCKET = process.env.S3_TMP_BUCKET || "video-tmp";
export const S3_PROD_BUCKET = process.env.S3_PROD_BUCKET || "video-prod";
export const S3_REGION = process.env.S3_REGION || "ap-northeast-1";
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";
export const S3_ENDPOINT = process.env.S3_ENDPOINT; // Optional: for MinIO, etc.
export const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

// Redis Configuration
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Sentinel Configuration (optional)
export const REDIS_SENTINEL_HOSTS = process.env.REDIS_SENTINEL_HOSTS; // e.g., "host1:26379,host2:26379,host3:26379"
export const REDIS_SENTINEL_NAME = process.env.REDIS_SENTINEL_NAME; // e.g., "mymaster"
export const REDIS_SENTINEL_PASSWORD = process.env.REDIS_SENTINEL_PASSWORD;

// Video Processing
export const VOD_BASE_URL = process.env.VOD_BASE_URL || "";
export const CALLBACK_SECRET = process.env.CALLBACK_SECRET || "callback-secret";
export const VOD_INTERNAL_SECRET =
  process.env.VOD_INTERNAL_SECRET || "vod-internal-secret";
