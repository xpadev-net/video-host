import "dotenv/config";
import * as process from "node:process";
import { z } from "zod";

export const DEV_DEFAULTS = {
  BETTER_AUTH_SECRET: "development-only-better-auth-secret-do-not-deploy",
  CALLBACK_SECRET: "dev-callback-secret",
  VOD_INTERNAL_SECRET: "dev-vod-internal-secret",
} as const;

const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === "" ? fallback : value === "true",
    );
const origin = z.url().refine((value) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    !url.hostname.includes("*") &&
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (url.pathname === "/" || url.pathname === "")
  );
}, "Expected an exact http(s) origin without a path, credentials, query, or fragment");
const origins = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  )
  .pipe(z.array(origin));

// Defaults depend on the parsed NODE_ENV, never on the importing process's mode.
// Production intentionally fails closed when an external origin or secret is absent.
export const EnvSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object") return input;
    const values = { ...input } as Record<string, unknown>;
    if (values.NODE_ENV === "development") {
      for (const [key, value] of Object.entries(DEV_DEFAULTS)) {
        if (!values[key]) values[key] = value;
      }
      if (!values.BETTER_AUTH_URL)
        values.BETTER_AUTH_URL = "http://localhost:3000";
      if (!values.FRONTEND_URL) values.FRONTEND_URL = "http://localhost:3000";
    }
    return values;
  },
  z
    .object({
      NODE_ENV: z.enum(["development", "production", "test"]),
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: origin,
      FRONTEND_URL: origin,
      AUTH_TRUSTED_ORIGINS: origins,
      CALLBACK_SECRET: z.string().min(1),
      VOD_INTERNAL_SECRET: z.string().min(1),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      SIGNUP_ENABLED: flag(false),
      SIGNUP_CODE: z.string().optional(),
      PASSWORD_AUTH_ENABLED: flag(true),
      OIDC_ENABLED: flag(false),
      OIDC_ISSUER_URL: z
        .union([z.url(), z.literal("")])
        .optional()
        .transform((value) => value || undefined),
      OIDC_CLIENT_ID: z.string().optional(),
      OIDC_CLIENT_SECRET: z.string().optional(),
      OIDC_SCOPE: z
        .string()
        .optional()
        .transform((value) => value || "openid profile email"),
      OIDC_DISPLAY_NAME: z
        .string()
        .optional()
        .transform((value) => value || "SSO"),
      OIDC_AUTO_PROVISION: flag(true),
      OIDC_ALLOW_HTTP: flag(false),
      // Extra exact browser origins, used by both CORS and application CSRF checks.
      CORS_ORIGIN: origins,
      PUBLIC_ENDPOINTS: z
        .string()
        .optional()
        .transform((value) =>
          value
            ? value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
        ),
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

      // OpenTelemetry metrics export (disabled when the endpoint is unset)
      OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().optional(),
      OTEL_SERVICE_NAME: z.string().optional(),
    })
    .superRefine((env, ctx) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", message });
      if (env.NODE_ENV === "production") {
        for (const [key, value] of Object.entries(DEV_DEFAULTS)) {
          if (env[key as keyof typeof DEV_DEFAULTS] === value)
            issue("Production cannot use development default secrets");
        }
        if (
          [
            env.BETTER_AUTH_SECRET,
            env.CALLBACK_SECRET,
            env.VOD_INTERNAL_SECRET,
          ].some((value) => value.startsWith("CHANGE_ME"))
        ) {
          issue("Production cannot use CHANGE_ME placeholder secrets");
        }
        if (
          ![
            env.BETTER_AUTH_URL,
            env.FRONTEND_URL,
            ...env.AUTH_TRUSTED_ORIGINS,
            ...env.CORS_ORIGIN,
          ].every((value) => value.startsWith("https://"))
        ) {
          issue(
            "BETTER_AUTH_URL, FRONTEND_URL and trusted browser origins must use https:// in production",
          );
        }
        if (env.OIDC_ALLOW_HTTP) issue("OIDC_ALLOW_HTTP is development-only");
      }
      if (!env.PASSWORD_AUTH_ENABLED && !env.OIDC_ENABLED)
        issue("At least one authentication method must be enabled");
      if (env.OIDC_ENABLED) {
        if (!env.OIDC_ISSUER_URL || !env.OIDC_CLIENT_ID)
          issue(
            "OIDC_ISSUER_URL and OIDC_CLIENT_ID are required when OIDC_ENABLED is true",
          );
        if (env.OIDC_ISSUER_URL) {
          let issuer: URL;
          try {
            issuer = new URL(env.OIDC_ISSUER_URL);
          } catch {
            issue("Invalid OIDC_ISSUER_URL");
            return;
          }
          if (
            issuer.username ||
            issuer.password ||
            issuer.search ||
            issuer.hash
          )
            issue(
              "OIDC_ISSUER_URL must not contain credentials, query, or fragment",
            );
          if (
            issuer.protocol !== "https:" &&
            !(
              issuer.protocol === "http:" &&
              env.OIDC_ALLOW_HTTP &&
              env.NODE_ENV === "development"
            )
          )
            issue(
              "OIDC_ISSUER_URL must use HTTPS (HTTP is explicitly allowed only in development)",
            );
        }
        if (
          !["openid", "email"].every((scope) =>
            env.OIDC_SCOPE.split(/\s+/).includes(scope),
          )
        )
          issue("OIDC_SCOPE must include openid and email");
      }
    })
    .transform((env) => ({
      ...env,
      AUTH_TRUSTED_ORIGINS: [
        ...new Set(
          [
            env.FRONTEND_URL,
            env.BETTER_AUTH_URL,
            ...env.AUTH_TRUSTED_ORIGINS,
            ...env.CORS_ORIGIN,
          ].map((value) => new URL(value).origin),
        ),
      ],
    })),
);

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  throw new Error(
    `Environment validation failed:\n${result.error.issues.map((issue) => `  ${issue.path.join(".") || "(schema)"}: ${issue.message}`).join("\n")}`,
  );
}
const env = result.data;
export const {
  NODE_ENV,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  FRONTEND_URL,
  AUTH_TRUSTED_ORIGINS,
  CORS_ORIGIN,
  PUBLIC_ENDPOINTS,
  PORT,
  SIGNUP_ENABLED,
  SIGNUP_CODE,
  PASSWORD_AUTH_ENABLED,
  OIDC_ENABLED,
  OIDC_ISSUER_URL,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_SCOPE,
  OIDC_DISPLAY_NAME,
  OIDC_AUTO_PROVISION,
  OIDC_ALLOW_HTTP,
  S3_TMP_BUCKET,
  S3_PROD_BUCKET,
  S3_REGION,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  REDIS_URL,
  REDIS_SENTINEL_HOSTS,
  REDIS_SENTINEL_NAME,
  REDIS_SENTINEL_PASSWORD,
  VOD_BASE_URL,
  CALLBACK_SECRET,
  VOD_INTERNAL_SECRET,
  OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  OTEL_SERVICE_NAME,
} = env;
