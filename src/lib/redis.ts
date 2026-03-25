import Redis, { Cluster } from 'ioredis';
import logger from '@/lib/logger';

const host = process.env.REDIS_HOST ?? 'localhost';
const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const tls = process.env.REDIS_TLS === 'true';
const isDev = process.env.NODE_ENV !== 'production';

// in dev, give up after 3 failed attempts — the in-memory fallback handles rate limiting
const DEV_MAX_RETRIES = 3;

const redisOptions = {
  tls: tls ? {} : undefined,
  enableReadyCheck: false,
  maxRetriesPerRequest: null as null,
  keepAlive: 30000,
};

// cluster mode for ElastiCache Valkey (REDIS_TLS=true), plain Redis for local dev
export const redis: Cluster | Redis = tls
  ? new Cluster([{ host, port }], {
      redisOptions,
      slotsRefreshTimeout: 5000,
      clusterRetryStrategy: (times) => Math.min(times * 200, 5000),
    })
  : new Redis({
      host, port, ...redisOptions,
      retryStrategy: (times) => {
        if (isDev && times > DEV_MAX_RETRIES) return null; // stop retrying
        return Math.min(times * 100, 3000);
      },
    });

// track connection state for consumers that need to know if redis is available
export let redisReady = false;

redis.on('ready', () => {
  redisReady = true;
  logger.info('redis connection established');
});

redis.on('error', (err) => {
  redisReady = false;
  if (isDev) {
    // log once, not every retry
    logger.warn('redis unavailable in dev, using in-memory fallback');
  } else {
    logger.error('redis connection error', { message: err.message });
  }
});

redis.on('close', () => {
  redisReady = false;
});
