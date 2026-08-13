import Redis, { type RedisOptions } from 'ioredis';
import { config } from './config';

/**
 * Shared Redis factory. Services configure their own event/cache semantics on
 * top of this single connection helper.
 */
export function createRedis(options: Partial<RedisOptions> = {}): Redis {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    keyPrefix: config.redis.keyPrefix || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 2000),
    ...options,
  });
}

/** Resolve once the client is connected and ready (or reject on first fatal). */
export async function waitForRedisReady(redis: Redis, timeoutMs = 10_000): Promise<void> {
  if (redis.status === 'ready') return;
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      redis.once('ready', () => resolve());
      redis.once('error', (err) => reject(err));
    }),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('redis connect timeout')), timeoutMs).unref(),
    ),
  ]);
}

/** Create a group on a stream idempotently (ignores BUSYGROUP). */
export async function ensureStreamGroup(
  redis: Redis,
  stream: string,
  group: string,
): Promise<void> {
  try {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
  } catch (err: any) {
    if (!String(err?.message ?? err).includes('BUSYGROUP')) {
      throw err;
    }
  }
}
