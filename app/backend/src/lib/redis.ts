import {
  createClient,
  createSentinel,
  type RedisClientType,
  type RedisSentinelType,
} from "redis";
import {
  REDIS_SENTINEL_HOSTS,
  REDIS_SENTINEL_NAME,
  REDIS_SENTINEL_PASSWORD,
  REDIS_URL,
} from "@/env";

let redisClient: RedisClientType | RedisSentinelType | null = null;

interface SentinelNode {
  host: string;
  port: number;
}

const createRedisClient = (): RedisClientType | RedisSentinelType => {
  // If Sentinel is configured, use Sentinel mode
  if (REDIS_SENTINEL_HOSTS && REDIS_SENTINEL_NAME) {
    const sentinels: SentinelNode[] = REDIS_SENTINEL_HOSTS.split(",").map(
      (host) => {
        const [hostname, port] = host.trim().split(":");
        return { host: hostname, port: parseInt(port || "26379", 10) };
      },
    );

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

export const getRedisClient = async (): Promise<
  RedisClientType | RedisSentinelType
> => {
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

export interface EncodeJob {
  movieId: string;
  s3Key: string;
  userId: string;
  createdAt: string;
}

export const addEncodeJob = async (job: EncodeJob): Promise<void> => {
  const client = await getRedisClient();
  await client.lPush(ENCODE_QUEUE_KEY, JSON.stringify(job));
};

// Progress tracking
export const ENCODE_PROGRESS_PREFIX = "video:encode:progress:";

export interface EncodeProgress {
  status: "queued" | "processing" | "retrying" | "completed" | "failed";
  progress?: number; // 0-100 percentage
  queuePosition?: number;
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

export const getEncodeProgress = async (
  movieId: string,
): Promise<EncodeProgress | null> => {
  const client = await getRedisClient();
  const result = await client.get(`${ENCODE_PROGRESS_PREFIX}${movieId}`);
  if (!result) return null;
  return JSON.parse(result) as EncodeProgress;
};

const QUEUE_SNAPSHOT_TTL_MS = 2000;
let queueSnapshot: {
  expiresAt: number;
  positions: Promise<Map<string, number>>;
} | null = null;

const loadQueuePositions = async (): Promise<Map<string, number>> => {
  const client = await getRedisClient();
  const queue = await client.lRange(ENCODE_QUEUE_KEY, 0, -1);
  const positions = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    try {
      const job = JSON.parse(queue[i]) as EncodeJob;
      // Position from end (1 = next to process)
      if (!positions.has(job.movieId)) {
        positions.set(job.movieId, queue.length - i);
      }
    } catch {
      // Skip malformed entries
    }
  }
  return positions;
};

// The whole queue is scanned at most once per TTL and shared by every SSE
// connection, so the cost no longer scales with connections x queue length.
export const getQueuePosition = async (movieId: string): Promise<number> => {
  const now = Date.now();
  if (!queueSnapshot || queueSnapshot.expiresAt <= now) {
    const positions = loadQueuePositions();
    const snapshot = { expiresAt: now + QUEUE_SNAPSHOT_TTL_MS, positions };
    queueSnapshot = snapshot;
    // Do not cache failures
    positions.catch(() => {
      if (queueSnapshot === snapshot) queueSnapshot = null;
    });
  }
  const positions = await queueSnapshot.positions;
  return positions.get(movieId) ?? -1; // -1: not in queue
};

export const closeRedis = async (): Promise<void> => {
  const client = redisClient;
  redisClient = null;
  if (!client) return;

  if ("quit" in client && typeof client.quit === "function") {
    await client.quit();
  } else if ("close" in client && typeof client.close === "function") {
    await client.close();
  }
};
