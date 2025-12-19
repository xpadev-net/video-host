import { createClient, createSentinel, RedisSentinelType, type RedisClientType } from "redis";
import {
  REDIS_URL,
  REDIS_SENTINEL_HOSTS,
  REDIS_SENTINEL_NAME,
  REDIS_SENTINEL_PASSWORD,
} from "./env";

let redisClient: RedisClientType | RedisSentinelType | null = null;

interface SentinelNode {
  host: string;
  port: number;
}

const createRedisClient = (): RedisClientType | RedisSentinelType => {
  // If Sentinel is configured, use Sentinel mode
  if (REDIS_SENTINEL_HOSTS && REDIS_SENTINEL_NAME) {
    const sentinels: SentinelNode[] = REDIS_SENTINEL_HOSTS.split(",").map((host) => {
      const [hostname, port] = host.trim().split(":");
      return { host: hostname, port: parseInt(port || "26379", 10) };
    });

    return createSentinel({
      name: REDIS_SENTINEL_NAME,
      sentinelRootNodes: sentinels,
      sentinelClientOptions: {
        password: REDIS_SENTINEL_PASSWORD,
      },
    });
  }

  // Otherwise, use standard connection
  return createClient({ url: REDIS_URL });
};

export const getRedisClient = async (): Promise<RedisClientType | RedisSentinelType> => {
  if (!redisClient) {
    redisClient = createRedisClient();
    redisClient.on("error", (err: Error) =>
      console.error("Redis Client Error", err),
    );
    await redisClient.connect();
  }
  return redisClient;
};

export const ENCODE_QUEUE_KEY = "video:encode:queue";
export const RETRY_QUEUE_KEY = "video:encode:retry:queue"; // Sorted set (ZSET)
export const MAX_RETRY_COUNT = 3;
export const INITIAL_RETRY_DELAY_SECONDS = 10;

export interface EncodeJob {
  movieId: string;
  s3Key: string;
  userId: string;
  createdAt: string;
  retryCount?: number;
  retryAfter?: number; // Unix timestamp in seconds
}

export const getEncodeJobBlocking = async (
  timeoutSeconds: number = 5,
): Promise<EncodeJob | null> => {
  const client = await getRedisClient();
  // Use BRPOP with timeout for blocking pop
  // brPop takes key and timeout as separate arguments
  const result = await client.brPop(ENCODE_QUEUE_KEY, timeoutSeconds);
  if (!result || !result.element) return null;
  return JSON.parse(result.element) as EncodeJob;
};

// Keep the old function for backward compatibility, but mark as deprecated
/** @deprecated Use getEncodeJobBlocking instead */
export const getEncodeJob = async (): Promise<EncodeJob | null> => {
  return getEncodeJobBlocking(5);
};

// Progress tracking
export const ENCODE_PROGRESS_PREFIX = "video:encode:progress:";

export interface EncodeProgress {
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  currentTime?: number;
  duration?: number;
}

export const setEncodeProgress = async (
  movieId: string,
  progress: EncodeProgress,
): Promise<void> => {
  const client = await getRedisClient();
  await client.setEx(
    `${ENCODE_PROGRESS_PREFIX}${movieId}`,
    3600, // 1 hour TTL
    JSON.stringify(progress),
  );
};

export const clearEncodeProgress = async (movieId: string): Promise<void> => {
  const client = await getRedisClient();
  await client.del(`${ENCODE_PROGRESS_PREFIX}${movieId}`);
};

export const addJobToRetryQueue = async (job: EncodeJob): Promise<void> => {
  const client = await getRedisClient();
  const retryCount = (job.retryCount || 0) + 1;

  if (retryCount > MAX_RETRY_COUNT) {
    console.error(
      `Job exceeded max retry count (${MAX_RETRY_COUNT}): movieId=${job.movieId}`,
    );
    return;
  }

  // Calculate exponential backoff: 10 * 2^retryCount seconds
  const delaySeconds = INITIAL_RETRY_DELAY_SECONDS * Math.pow(2, retryCount - 1);
  const retryAfter = Math.floor(Date.now() / 1000) + delaySeconds;

  const jobWithRetry: EncodeJob = {
    ...job,
    retryCount,
    retryAfter,
  };

  // Add to sorted set with retryAfter as score
  await client.zAdd(RETRY_QUEUE_KEY, {
    score: retryAfter,
    value: JSON.stringify(jobWithRetry),
  });

  console.log(
    `Added job to retry queue: movieId=${job.movieId}, retryCount=${retryCount}, retryAfter=${new Date(retryAfter * 1000).toISOString()}`,
  );
};

export const processRetryQueue = async (): Promise<number> => {
  const client = await getRedisClient();
  const now = Math.floor(Date.now() / 1000);

  // Get jobs that are ready to retry (score <= now)
  const readyJobs = await client.zRangeByScore(RETRY_QUEUE_KEY, 0, now, {
    LIMIT: { offset: 0, count: 10 }, // Process up to 10 jobs at a time
  });

  if (readyJobs.length === 0) {
    return 0;
  }

  let movedCount = 0;
  for (const jobJson of readyJobs) {
    try {
      const job = JSON.parse(jobJson) as EncodeJob;
      // Remove from retry queue
      await client.zRem(RETRY_QUEUE_KEY, jobJson);
      // Add back to main queue
      await client.rPush(ENCODE_QUEUE_KEY, JSON.stringify(job));
      movedCount++;
      console.log(
        `Moved job from retry queue to main queue: movieId=${job.movieId}, retryCount=${job.retryCount}`,
      );
    } catch (error) {
      console.error("Error processing retry queue job:", error);
      // Remove invalid job from retry queue
      await client.zRem(RETRY_QUEUE_KEY, jobJson);
    }
  }

  return movedCount;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await ((redisClient as RedisClientType).quit || (redisClient as RedisSentinelType).close)?.();
    redisClient = null;
  }
};
