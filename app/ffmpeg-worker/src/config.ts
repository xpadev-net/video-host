import { z } from "zod";

export const MAX_RETRY_COUNT = 3;
export const INITIAL_RETRY_DELAY_SECONDS = 60;
export const MAX_RETRY_DELAY_SECONDS = 15 * 60;
export const DEAD_LETTER_MAX_ENTRIES = 10_000;
export const ENCODE_PROGRESS_TTL_SECONDS = 60 * 60;
export const JOB_COMPLETION_TTL_SECONDS = 24 * 60 * 60;
export const RETRY_QUEUE_BATCH_SIZE = 100;
export const RETRY_QUEUE_POLL_INTERVAL_MS = 10_000;
export const PROCESSING_JOB_LEASE_MS = 5 * 60 * 1000;
export const PROCESSING_JOB_HEARTBEAT_MS = 30 * 1000;
export const DISK_SPACE_MARGIN_BYTES = 512 * 1024 * 1024;
export const DISK_SPACE_MULTIPLIER = 2.5;

const text = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || fallback);
const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const integer = (minimum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().min(minimum).finite(),
  );

const optionalFlag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined || value.trim() === "") return fallback;
      switch (value.trim().toLowerCase()) {
        case "true":
        case "1":
        case "yes":
          return true;
        case "false":
        case "0":
        case "no":
          return false;
        default:
          context.addIssue({
            code: "custom",
            message: "Expected true/false, 1/0, or yes/no",
          });
          return z.NEVER;
      }
    });

export const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  REDIS_URL: text("redis://localhost:6379"),
  REDIS_SENTINEL_HOSTS: optionalText,
  REDIS_SENTINEL_NAME: optionalText,
  REDIS_SENTINEL_PASSWORD: optionalText,
  S3_TMP_BUCKET: text("video-tmp"),
  S3_PROD_BUCKET: text("video-prod"),
  S3_REGION: text("ap-northeast-1"),
  S3_ACCESS_KEY_ID: text(""),
  S3_SECRET_ACCESS_KEY: text(""),
  S3_ENDPOINT: optionalText,
  S3_FORCE_PATH_STYLE: optionalFlag(false),
  BACKEND_BASE_URL: optionalText,
  BACKEND_CALLBACK_URL: optionalText,
  CALLBACK_SECRET: optionalText,
  VOD_BASE_URL: text("http://localhost:3002"),
  POLL_INTERVAL_MS: integer(1).default(5000),
  TEMP_DIR: text("/tmp/ffmpeg-worker"),
  MIN_DISK_SPACE_GB: integer(0).default(1),
  JOB_TIMEOUT_SECONDS: integer(1).default(7200),
  FFMPEG_THREADS: integer(1).optional(),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalText,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: optionalText,
  OTEL_SERVICE_NAME: optionalText,
});

export type WorkerEnv = Omit<
  z.infer<typeof WorkerEnvSchema>,
  "CALLBACK_SECRET" | "BACKEND_BASE_URL" | "FFMPEG_THREADS"
> & {
  CALLBACK_SECRET: string;
  BACKEND_BASE_URL: string;
  FFMPEG_THREADS: number;
};

export const parseWorkerEnv = (
  source: Record<string, string | undefined>,
  defaultThreads: number,
): WorkerEnv => {
  let parsed: z.infer<typeof WorkerEnvSchema>;
  try {
    parsed = WorkerEnvSchema.parse({
      ...source,
      FFMPEG_THREADS: source.FFMPEG_THREADS || defaultThreads,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues
        .map(
          (issue) =>
            `${issue.path.join(".") || "environment"}: ${issue.message}`,
        )
        .join("\n");
      throw new Error(`Invalid worker environment:\n${details}`, {
        cause: error,
      });
    }
    throw error;
  }

  const callbackSecret =
    parsed.CALLBACK_SECRET ??
    (parsed.NODE_ENV === "development" ? "dev-callback-secret" : undefined);
  if (!callbackSecret) {
    throw new Error(
      "Required environment variable CALLBACK_SECRET is not set. Set it in your environment or use NODE_ENV=development for defaults.",
    );
  }

  return {
    ...parsed,
    BACKEND_BASE_URL:
      parsed.BACKEND_BASE_URL ??
      parsed.BACKEND_CALLBACK_URL ??
      "http://localhost:3001",
    CALLBACK_SECRET: callbackSecret,
    FFMPEG_THREADS: parsed.FFMPEG_THREADS ?? defaultThreads,
  };
};
