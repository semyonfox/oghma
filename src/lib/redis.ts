import Redis, { Cluster } from 'ioredis';
import logger from '@/lib/logger';

export type RedisConnection = Cluster | Redis;

// track connection state for consumers that need to know if redis is available
export let redisReady = false;

// Use lazy initialization because the Next.js build evaluates this module during page data collection.
// REDIS_HOST and REDIS_PORT are not available yet. They come from .env.production at runtime.
let _redis: RedisConnection | null = null;
let _redisReadyWait: Promise<boolean> | null = null;

function initRedis(): RedisConnection {
  if (_redis) return _redis;

  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
  const tls = process.env.REDIS_TLS === 'true';

  const redisOptions = {
    tls: tls ? {} : undefined,
    enableReadyCheck: false,
    maxRetriesPerRequest: null as null,
    keepAlive: 30000,
  };

  _redis = tls
    ? new Cluster([{ host, port }], {
        redisOptions,
        slotsRefreshTimeout: 5000,
        clusterRetryStrategy: (times) => Math.min(times * 200, 5000),
      })
    : new Redis({ host, port, ...redisOptions, retryStrategy: (times) => Math.min(times * 100, 3000) });

  _redis.on('ready', () => {
    redisReady = true;
    logger.info('redis connection established');
  });

  _redis.on('error', (err) => {
    redisReady = false;
    logger.error('redis connection error', { message: err.message });
  });

  _redis.on('close', () => {
    redisReady = false;
  });

  return _redis;
}

export function ensureRedisReady(timeoutMs = 750): Promise<boolean> {
  const instance = initRedis();
  if (redisReady || instance.status === 'ready') {
    redisReady = true;
    return Promise.resolve(true);
  }

  if (_redisReadyWait) return _redisReadyWait;

  _redisReadyWait = new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      instance.off('ready', onReady);
      instance.off('error', onUnavailable);
      instance.off('close', onUnavailable);
      _redisReadyWait = null;
      if (ready) redisReady = true;
      resolve(ready);
    };

    const onReady = () => finish(true);
    const onUnavailable = () => finish(false);

    instance.once('ready', onReady);
    instance.once('error', onUnavailable);
    instance.once('close', onUnavailable);
    timer = setTimeout(() => finish(redisReady || instance.status === 'ready'), timeoutMs);
  });

  return _redisReadyWait;
}

/**
 * A blocking Redis command monopolises its connection until it returns. SSE
 * readers must use a private connection so an idle stream cannot delay the
 * command client used by requests, rate limiting, presence, and BullMQ.
 */
export function createBlockingRedisConnection(): RedisConnection {
  const connection = initRedis();
  return connection instanceof Cluster
    ? connection.duplicate()
    : connection.duplicate();
}

// proxy so existing `import { redis }` keeps working — defers actual connection to first use
export const redis: RedisConnection = new Proxy({} as Cluster & Redis, {
  get(_, prop) {
    const instance = initRedis();
    const value: unknown = Reflect.get(instance, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
