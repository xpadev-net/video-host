import type { z } from "zod";

export type EncodeJob = {
  movieId: string;
  s3Key: string;
  userId: string;
  createdAt: string;
  retryCount?: number;
  retryAfter?: number;
};

export declare const EncodeJobSchema: z.ZodType<EncodeJob>;

export type EncodeProgress = {
  status: "queued" | "processing" | "retrying" | "completed" | "failed";
  progress?: number;
  queuePosition?: number;
  currentTime?: number;
  duration?: number;
};

export declare const EncodeProgressSchema: z.ZodType<EncodeProgress>;
