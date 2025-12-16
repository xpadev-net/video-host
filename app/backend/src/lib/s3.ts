import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3_ACCESS_KEY_ID,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_PROD_BUCKET,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
  S3_TMP_BUCKET,
} from "@/env";

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

export const generateUploadKey = (userId: string, filename: string): string => {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `uploads/${userId}/${timestamp}_${sanitizedFilename}`;
};

export const getPresignedUploadUrl = async (
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

export const deleteFromS3 = async (
  bucket: string,
  key: string,
): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  await s3Client.send(command);
};

export const deleteTmpFile = async (key: string): Promise<void> => {
  await deleteFromS3(S3_TMP_BUCKET, key);
};

export const deleteProdFile = async (key: string): Promise<void> => {
  await deleteFromS3(S3_PROD_BUCKET, key);
};

export { S3_TMP_BUCKET, S3_PROD_BUCKET };
