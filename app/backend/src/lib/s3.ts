import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
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

// Buckets and their policies are provisioned by infrastructure. The API only
// verifies that its configured buckets are reachable.
const requireBucket = async (bucket: string): Promise<void> => {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    throw new Error(`Required S3 bucket "${bucket}" is unavailable`, {
      cause: error,
    });
  }
};

// Verify infrastructure-provisioned buckets on startup.
export const initializeS3Buckets = async (): Promise<void> => {
  await Promise.all([
    requireBucket(S3_TMP_BUCKET),
    requireBucket(S3_PROD_BUCKET),
  ]);
  console.log("Required S3 buckets are available");
};

// Key prefix every upload of this user lives under; POST /movies relies on it
// to refuse keys pointing at someone else's objects.
export const uploadKeyPrefix = (userId: string): string => `uploads/${userId}/`;

export const generateUploadKey = (userId: string, filename: string): string => {
  const extension = /\.[a-zA-Z0-9]{1,16}$/.exec(filename)?.[0] ?? "";
  return `${uploadKeyPrefix(userId)}${randomUUID()}${extension.toLowerCase()}`;
};

export const getPresignedUploadUrl = async (
  key: string,
  contentType: string,
  size: number,
  expiresIn = 3600,
): Promise<string> => {
  // Content-Length is part of the signature, so the URL (even if replayed)
  // can only ever store an object of exactly this size.
  const command = new PutObjectCommand({
    Bucket: S3_TMP_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
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

export const tmpFileExists = async (key: string): Promise<boolean> => {
  try {
    await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_TMP_BUCKET, Key: key }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.$metadata.httpStatusCode === 404 || error.name === "NotFound")
    ) {
      return false;
    }
    throw error;
  }
};

// Size in bytes of an object in the tmp bucket, or null when it is missing.
export const getTmpFileSize = async (key: string): Promise<number | null> => {
  try {
    const head = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_TMP_BUCKET, Key: key }),
    );
    return head.ContentLength ?? 0;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.$metadata.httpStatusCode === 404 || error.name === "NotFound")
    ) {
      return null;
    }
    throw error;
  }
};

export const deleteTmpFile = async (key: string): Promise<void> => {
  await deleteFromS3(S3_TMP_BUCKET, key);
};

export const deleteProdFile = async (key: string): Promise<void> => {
  await deleteFromS3(S3_PROD_BUCKET, key);
};

export { S3_PROD_BUCKET, S3_TMP_BUCKET };
