const { z } = require("zod");

const EncodeJobSchema = z.object({
  movieId: z.string().min(1),
  s3Key: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string(),
  retryCount: z.number().int().nonnegative().optional(),
  retryAfter: z.number().nonnegative().optional(),
});

const EncodeProgressSchema = z.object({
  status: z.enum(["queued", "processing", "retrying", "completed", "failed"]),
  progress: z.number().optional(),
  queuePosition: z.number().optional(),
  currentTime: z.number().optional(),
  duration: z.number().optional(),
});

module.exports = { EncodeJobSchema, EncodeProgressSchema };
