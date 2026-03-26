import Redis, { Cluster } from 'ioredis';
import logger from '@/lib/logger';

// track connection state for consumers that need to know if redis is available
export let redisReady = false;

// lazy init — next build evaluates this module at page data collection time
// but REDIS_HOST/PORT aren't available yet (comes from .env.production at runtime)
let _redis: Cluster | Redis | null = null;

function initRedis(): Cluster | Redis {
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

// proxy so existing `import { redis }` keeps working — defers actual connection to first use
export const redis: Cluster | Redis = new Proxy({} as Cluster & Redis, {
  get(_, prop) {
    const instance = initRedis();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  },
});
