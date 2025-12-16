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
): Promise<void> => {
  const command = new GetObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: s3Key,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error("Empty response body");
  }

  const writeStream = createWriteStream(localPath);
  await pipeline(response.Body as Readable, writeStream);
};

export const uploadToProd = async (
  s3Key: string,
  localPath: string,
  contentType = "video/mp4",
): Promise<void> => {
  const readStream = createReadStream(localPath);
  const command = new PutObjectCommand({
    Bucket: S3_PROD_BUCKET,
    Key: s3Key,
    Body: readStream,
    ContentType: contentType,
  });

  await s3Client.send(command);
};

export const deleteFromTmp = async (s3Key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: s3Key,
  });
  await s3Client.send(command);
};

export { S3_TMP_BUCKET, S3_PROD_BUCKET };
