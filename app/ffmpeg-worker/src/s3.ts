import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import {
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_REGION,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_TMP_BUCKET,
  S3_PROD_BUCKET,
} from "./env";

const s3Config: {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  endpoint?: string;
  forcePathStyle?: boolean;
} = {
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
};

if (S3_ENDPOINT) {
  s3Config.endpoint = S3_ENDPOINT;
}

if (S3_FORCE_PATH_STYLE) {
  s3Config.forcePathStyle = true;
}

export const s3Client = new S3Client(s3Config);

export const downloadFromTmp = async (
  s3Key: string,
  localPath: string,
  abortSignal?: AbortSignal,
): Promise<void> => {
  // Check if already aborted before starting
  if (abortSignal?.aborted) {
    throw new Error("Download aborted before start");
  }

  const command = new GetObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: s3Key,
  });

  const response = await s3Client.send(command, { abortSignal });
  if (!response.Body) {
    throw new Error("Empty response body");
  }

  const writeStream = createWriteStream(localPath);
  const body = response.Body as Readable;

  // Handle abort during streaming
  if (abortSignal) {
    const abortHandler = () => {
      body.destroy(new Error("Download aborted due to timeout"));
      writeStream.destroy(new Error("Download aborted due to timeout"));
    };
    abortSignal.addEventListener("abort", abortHandler, { once: true });
    try {
      await pipeline(body, writeStream);
    } finally {
      abortSignal.removeEventListener("abort", abortHandler);
    }
  } else {
    await pipeline(body, writeStream);
  }
};

export const uploadToProd = async (
  s3Key: string,
  localPath: string,
  contentType = "video/mp4",
  abortSignal?: AbortSignal,
): Promise<void> => {
  // Check if already aborted before starting
  if (abortSignal?.aborted) {
    throw new Error("Upload aborted before start");
  }

  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check abort signal between retries
    if (abortSignal?.aborted) {
      throw new Error("Upload aborted due to timeout");
    }

    try {
      const readStream = createReadStream(localPath);
      const command = new PutObjectCommand({
        Bucket: S3_PROD_BUCKET,
        Key: s3Key,
        Body: readStream,
        ContentType: contentType,
      });

      await s3Client.send(command, { abortSignal });
      return; // Success
    } catch (error) {
      // If aborted, don't retry
      if (abortSignal?.aborted) {
        throw new Error("Upload aborted due to timeout");
      }

      lastError = error as Error;
      const isRetryable =
        error instanceof Error &&
        ("$fault" in error || error.message.includes("InternalError"));

      if (isRetryable && attempt < maxRetries) {
        console.log(
          `Upload attempt ${attempt} failed, retrying in ${attempt * 2}s...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 2000),
        );
      } else {
        throw error;
      }
    }
  }

  throw lastError;
};

export const deleteFromTmp = async (s3Key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: s3Key,
  });
  await s3Client.send(command);
};

export { S3_TMP_BUCKET, S3_PROD_BUCKET };
