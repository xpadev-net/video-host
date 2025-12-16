import { createClient, type RedisClientType } from "redis";
import {
  REDIS_SENTINEL_HOSTS,
  REDIS_SENTINEL_NAME,
  REDIS_SENTINEL_PASSWORD,
  REDIS_URL,
} from "@/env";

let redisClient: RedisClientType | null = null;

interface SentinelNode {
  host: string;
  port: number;
}

const createRedisClient = (): RedisClientType => {
  // If Sentinel is configured, use Sentinel mode
  if (REDIS_SENTINEL_HOSTS && REDIS_SENTINEL_NAME) {
    const sentinels: SentinelNode[] = REDIS_SENTINEL_HOSTS.split(",").map(
      (host) => {
        const [hostname, port] = host.trim().split(":");
        return { host: hostname, port: parseInt(port || "26379", 10) };
      },
    );

    // Build sentinel URL format: redis://host:port
    // The node-redis library supports sentinel through URL configuration
    // Format: redis+sentinel://[:password@]host1:port1,host2:port2,.../master_name
    const sentinelHosts = sentinels.map((s) => `${s.host}:${s.port}`).join(",");
    const passwordPart = REDIS_SENTINEL_PASSWORD
      ? `:${REDIS_SENTINEL_PASSWORD}@`
      : "";
    const sentinelUrl = `redis+sentinel://${passwordPart}${sentinelHosts}/${REDIS_SENTINEL_NAME}`;

    return createClient({ url: sentinelUrl }) as RedisClientType;
  }

  // Otherwise, use standard connection
  return createClient({ url: REDIS_URL });
};

export const getRedisClient = async (): Promise<RedisClientType> => {
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

export const getEncodeJob = async (): Promise<EncodeJob | null> => {
  const client = await getRedisClient();
  const result = await client.rPop(ENCODE_QUEUE_KEY);
  if (!result) return null;
  return JSON.parse(result) as EncodeJob;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
