import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  CORS_ORIGIN,
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

// Check if bucket exists
const bucketExists = async (bucket: string): Promise<boolean> => {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
};

// Create bucket if it doesn't exist
const createBucketIfNotExists = async (bucket: string): Promise<void> => {
  if (await bucketExists(bucket)) {
    console.log(`Bucket ${bucket} already exists`);
    return;
  }

  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} created`);
  } catch (error) {
    console.error(`Failed to create bucket ${bucket}:`, error);
  }
};

// Configure CORS for bucket
const configureBucketCors = async (bucket: string): Promise<void> => {
  try {
    const corsRules = {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
          AllowedOrigins: CORS_ORIGIN.length > 0 ? CORS_ORIGIN : ["*"],
          ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
          MaxAgeSeconds: 3600,
        },
      ],
    };

    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: corsRules,
      }),
    );
    console.log(`CORS configured for bucket ${bucket}`);
  } catch (error) {
    console.error(`Failed to configure CORS for bucket ${bucket}:`, error);
  }
};

// Initialize S3 buckets on startup
export const initializeS3Buckets = async (): Promise<void> => {
  console.log("Initializing S3 buckets...");

  // Create buckets
  await createBucketIfNotExists(S3_TMP_BUCKET);
  await createBucketIfNotExists(S3_PROD_BUCKET);

  // Configure CORS
  await configureBucketCors(S3_TMP_BUCKET);
  await configureBucketCors(S3_PROD_BUCKET);

  console.log("S3 bucket initialization complete");
};

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
