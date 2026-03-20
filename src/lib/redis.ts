import Redis from 'ioredis';

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
export const redis: Redis.Cluster | Redis = tls
  ? new Redis.Cluster([{ host, port }], {
      redisOptions,
      slotsRefreshTimeout: 5000,
      clusterRetryStrategy: (times) => Math.min(times * 200, 5000),
    })
  : new Redis({ host, port, ...redisOptions, retryStrategy: (times) => Math.min(times * 100, 3000) });

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});
