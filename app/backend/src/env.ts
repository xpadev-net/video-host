import "dotenv/config";
import * as process from "node:process";
import { z } from "zod";

/**
 * Environment configuration with Zod validation.
 *
 * Security-sensitive variables (JWT_SECRET, PASSWORD_SALT, etc.) are required
 * in production mode and cannot use development defaults.
 *
 * Development defaults are only allowed when NODE_ENV=development.
 */

const DEV_DEFAULTS = {
  JWT_SECRET: "dev-jwt-secret",
  PASSWORD_SALT: "dev-password-salt",
  CALLBACK_SECRET: "dev-callback-secret",
  VOD_INTERNAL_SECRET: "dev-vod-internal-secret",
} as const;

/**
 * Determines if we should allow development defaults.
 * Reads NODE_ENV directly from process.env at call time.
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Creates a Zod string schema for secrets that:
 * - In production/test: requires actual values (no defaults)
 * - In development: allows development defaults with a warning
 */
function createSecretSchema(name: keyof typeof DEV_DEFAULTS) {
  return z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (val && val.length > 0) {
        return;
      }

      if (isDevelopment()) {
        // Will be transformed to dev default later
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} is required in production`,
      });
    })
    .transform((val) => {
      if (val && val.length > 0) {
        return val;
      }
      // Only reached in development mode (validated above)
      console.warn(`Warning: ${name} not set, using development default`);
      return DEV_DEFAULTS[name];
    });
}

/**
 * Zod schema for environment validation.
 * Security-sensitive variables will cause startup failure if missing in production.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // Security-sensitive (required in production)
    JWT_SECRET: createSecretSchema("JWT_SECRET"),
    PASSWORD_SALT: createSecretSchema("PASSWORD_SALT"),
    CALLBACK_SECRET: createSecretSchema("CALLBACK_SECRET"),
    VOD_INTERNAL_SECRET: createSecretSchema("VOD_INTERNAL_SECRET"),

    // Password hashing - minimum 12 rounds for security
    PASSWORD_HASH_ROUNDS: z.coerce.number().min(12).default(12),

    // Token and server settings
    TOKEN_EXPIRY: z.coerce.number().default(604800), // seconds
    PORT: z.coerce.number().default(3000),

    // Signup configuration
    SIGNUP_ENABLED: z
      .string()
      .optional()
      .transform((val) => val === "true")
      .default(false),
    SIGNUP_CODE: z.string().optional(),

    // CORS and endpoints
    PUBLIC_ENDPOINTS: z
      .string()
      .optional()
      .transform((val) => (val ? val.split(",") : []))
      .default([]),
    CORS_ORIGIN: z
      .string()
      .optional()
      .transform((val) => (val ? val.split(",") : []))
      .default([]),

    // S3 Configuration
    S3_TMP_BUCKET: z.string().default("video-tmp"),
    S3_PROD_BUCKET: z.string().default("video-prod"),
    S3_REGION: z.string().default("ap-northeast-1"),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_ENDPOINT: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((val) => val === "true")
      .default(false),

    // Redis Configuration
    REDIS_URL: z.string().default("redis://localhost:6379"),
    REDIS_SENTINEL_HOSTS: z.string().optional(),
    REDIS_SENTINEL_NAME: z.string().optional(),
    REDIS_SENTINEL_PASSWORD: z.string().optional(),

    // Video Processing
    VOD_BASE_URL: z.string().default(""),
  })
  .refine(
    (env) => {
      // In production, reject development defaults
      if (env.NODE_ENV === "production") {
        for (const [key, devValue] of Object.entries(DEV_DEFAULTS)) {
          const typedKey = key as keyof typeof DEV_DEFAULTS;
          if (env[typedKey] === devValue) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message:
        "Production environment cannot use development default secrets. " +
        "Please set JWT_SECRET, PASSWORD_SALT, CALLBACK_SECRET, and VOD_INTERNAL_SECRET to non-default values.",
    },
  );

// Export the schema for testing purposes
export { EnvSchema, DEV_DEFAULTS };

/**
 * Parses and validates environment variables.
 * Throws a descriptive error if validation fails.
 */
function parseEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(schema)";
        return `  ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

const env = parseEnv();

// Export individual validated values
export const PUBLIC_ENDPOINTS = env.PUBLIC_ENDPOINTS;
export const CORS_ORIGIN = env.CORS_ORIGIN;
export const PASSWORD_SALT = env.PASSWORD_SALT;
export const PASSWORD_HASH_ROUNDS = env.PASSWORD_HASH_ROUNDS;
export const TOKEN_EXPIRY = env.TOKEN_EXPIRY * 1000; // Convert seconds to milliseconds
export const SIGNUP_ENABLED = env.SIGNUP_ENABLED;
export const SIGNUP_CODE = env.SIGNUP_CODE;
export const PORT = env.PORT;
export const JWT_SECRET = env.JWT_SECRET;

// S3 Configuration
export const S3_TMP_BUCKET = env.S3_TMP_BUCKET;
export const S3_PROD_BUCKET = env.S3_PROD_BUCKET;
export const S3_REGION = env.S3_REGION;
export const S3_ACCESS_KEY_ID = env.S3_ACCESS_KEY_ID;
export const S3_SECRET_ACCESS_KEY = env.S3_SECRET_ACCESS_KEY;
export const S3_ENDPOINT = env.S3_ENDPOINT;
export const S3_FORCE_PATH_STYLE = env.S3_FORCE_PATH_STYLE;

// Redis Configuration
export const REDIS_URL = env.REDIS_URL;
export const REDIS_SENTINEL_HOSTS = env.REDIS_SENTINEL_HOSTS;
export const REDIS_SENTINEL_NAME = env.REDIS_SENTINEL_NAME;
export const REDIS_SENTINEL_PASSWORD = env.REDIS_SENTINEL_PASSWORD;

// Video Processing
export const VOD_BASE_URL = env.VOD_BASE_URL;
export const CALLBACK_SECRET = env.CALLBACK_SECRET;
export const VOD_INTERNAL_SECRET = env.VOD_INTERNAL_SECRET;

// Legacy export for backward compatibility
// Note: New code should import specific values directly
export const requireEnv = (name: string, defaultForDev?: string): string => {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === "development" && defaultForDev !== undefined) {
    console.warn(`Warning: ${name} not set, using development default`);
    return defaultForDev;
  }

  throw new Error(
    `Required environment variable ${name} is not set. ` +
      `Set it in your environment or use NODE_ENV=development for defaults.`,
  );
};
