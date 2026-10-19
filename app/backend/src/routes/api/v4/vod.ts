import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import { S3_PROD_BUCKET, VOD_ALLOW_UNSIGNED, VOD_INTERNAL_SECRET } from "@/env";
import { s3Client } from "@/lib/s3";
import { verifyVodToken } from "@/lib/vod-token";
import { unauthorized } from "@/utils/response";
import { safeEqual } from "@/utils/safeEqual";

/**
 * Validates an S3 key to prevent path traversal attacks.
 * Rejects empty keys, absolute paths, parent directory references, and null byte injection.
 * @param key - The S3 key to validate
 * @returns true if the key is valid, false otherwise
 */
export const isValidS3Key = (key: string): boolean => {
  try {
    const decoded = decodeURIComponent(key);
    // Reject empty keys
    if (!decoded) {
      return false;
    }
    // Reject absolute paths
    if (decoded.startsWith("/")) {
      return false;
    }
    // Reject parent directory references (path traversal)
    if (decoded.includes("..")) {
      return false;
    }
    // Reject null byte injection
    if (decoded.includes("\0")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const app = new Hono<Env>();

// VOD mapping endpoint for nginx-vod-module
// Returns JSON mapping for the requested file path
// Protected by internal secret header
export const vodRoute = app.get("/mapping/*", async (c) => {
  // Verify internal secret from nginx
  const internalSecret = c.req.header("X-Vod-Internal-Secret");
  if (!internalSecret || !safeEqual(internalSecret, VOD_INTERNAL_SECRET)) {
    unauthorized("Invalid internal secret");
  }

  // Extract the s3Key from the path
  const fullPath = c.req.path;
  // URL format: /vod/mapping/{token}/{s3Key}
  const tokenAndKey = fullPath.replace("/api/v4/vod/mapping/", "");
  const separator = tokenAndKey.indexOf("/");
  const token = separator === -1 ? "" : tokenAndKey.slice(0, separator);
  const signedKey = separator === -1 ? "" : tokenAndKey.slice(separator + 1);
  const tokenValid = !!signedKey && verifyVodToken(token, signedKey);
  // During a rolling deploy older pods still hand out unsigned URLs.
  const s3Key = tokenValid || !VOD_ALLOW_UNSIGNED ? signedKey : tokenAndKey;

  if (!s3Key) {
    return c.json({ error: "Missing s3Key" }, 400);
  }

  // Validate S3 key to prevent path traversal attacks
  if (!isValidS3Key(s3Key)) {
    return c.json({ error: "Invalid s3Key" }, 400);
  }

  // The URL must have been issued by the API for a viewer allowed to watch
  // this movie; knowing the (guessable) key alone is not enough.
  if (!tokenValid && !VOD_ALLOW_UNSIGNED) {
    unauthorized("Invalid or expired playback token");
  }

  // Generate presigned GET URL for the S3 object
  const command = new GetObjectCommand({
    Bucket: S3_PROD_BUCKET,
    Key: s3Key,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 3600, // 1 hour
  });

  // Parse the presigned URL to extract protocol and path for nginx-vod-module
  const url = new URL(presignedUrl);
  const remotePath = `${url.pathname}${url.search}`;

  // Return nginx-vod-module mapping JSON format (raw JSON, not wrapped)
  const mapping = {
    sequences: [
      {
        clips: [
          {
            type: "source",
            path: remotePath,
          },
        ],
      },
    ],
  };
  // Return raw JSON for nginx-vod-module compatibility
  return c.json(mapping);
});

export const registerVodRoute = (app: HonoApp) => {
  app.route("/vod", vodRoute);
};
