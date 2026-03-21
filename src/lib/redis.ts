import Redis, { Cluster } from 'ioredis';
import logger from '@/lib/logger';

const host = process.env.REDIS_HOST ?? 'localhost';
const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const tls = process.env.REDIS_TLS === 'true';

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
  : new Redis({ host, port, ...redisOptions, retryStrategy: (times) => Math.min(times * 100, 3000) });

// track connection state for consumers that need to know if redis is available
export let redisReady = false;

redis.on('ready', () => {
  redisReady = true;
  logger.info('redis connection established');
});

redis.on('error', (err) => {
  redisReady = false;
  logger.error('redis connection error', { message: err.message });
});

redis.on('close', () => {
  redisReady = false;
});
