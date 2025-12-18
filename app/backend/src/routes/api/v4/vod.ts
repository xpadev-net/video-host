import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { User } from "@prisma/client";
import { Hono } from "hono";
import type { HonoApp } from "@/@types/hono";
import { S3_PROD_BUCKET, VOD_INTERNAL_SECRET } from "@/env";
import { s3Client } from "@/lib/s3";
import { unauthorized } from "@/utils/response";

type Env = {
  Variables: {
    user?: User;
  };
};

const app = new Hono<Env>();

// VOD mapping endpoint for nginx-vod-module
// Returns JSON mapping for the requested file path
// Protected by internal secret header
export const vodRoute = app.get("/mapping/*", async (c) => {
  // Verify internal secret from nginx
  const internalSecret = c.req.header("X-Vod-Internal-Secret");
  if (internalSecret !== VOD_INTERNAL_SECRET) {
    return unauthorized(c, "Invalid internal secret");
  }

  // Extract the s3Key from the path
  // URL format: /vod/mapping/{s3Key}
  const fullPath = c.req.path;
  const s3Key = fullPath.replace("/api/v4/vod/mapping/", "");

  if (!s3Key) {
    return c.json({ error: "Missing s3Key" }, 400);
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
  console.log(JSON.stringify(mapping, null, 2));

  // Return raw JSON for nginx-vod-module compatibility
  return c.json(mapping);
});

export const registerVodRoute = (app: HonoApp) => {
  app.route("/vod", vodRoute);
};
