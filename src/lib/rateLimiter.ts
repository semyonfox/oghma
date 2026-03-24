// generic sliding-window rate limiter backed by ElastiCache (Valkey)
// uses sorted sets for true sliding window — no burst-at-boundary problem
// violations are logged to PostgreSQL for audit (fire-and-forget)

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { redis, redisReady } from '@/lib/redis';
import { RATE_LIMITS, type RateLimitRule } from '@/lib/rateLimitConfig';
import { Metrics } from '@/lib/metrics';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

// in-memory fallback for when redis is unavailable
const memWindows = new Map<string, number[]>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window slides enough to allow next request
}

async function redisCheck(key: string, rule: RateLimitRule, now: number): Promise<RateLimitResult> {
  const windowStart = now - rule.windowSeconds * 1000;

  // pipeline: remove expired + count + add current + set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
  pipeline.expire(key, rule.windowSeconds);

  const results = await pipeline.exec();
  if (!results) throw new Error('pipeline returned null');

  const count = (results[1]?.[1] as number) ?? 0;

  if (count >= rule.limit) {
    // over limit — remove the entry we just added (it shouldn't count)
    // get the oldest entry to calculate retryAfter
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTs = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
    const retryAfter = Math.ceil((oldestTs + rule.windowSeconds * 1000 - now) / 1000);

    // remove the request we just added since it was over limit
    const members = await redis.zrangebyscore(key, now, now);
    if (members.length > 0) {
      await redis.zrem(key, members[members.length - 1]);
    }

    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: rule.limit - count - 1, retryAfter: 0 };
}

function memCheck(key: string, rule: RateLimitRule, now: number): RateLimitResult {
  const windowStart = now - rule.windowSeconds * 1000;
  let timestamps = memWindows.get(key) ?? [];

  // slide window: remove expired
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= rule.limit) {
    const oldest = timestamps[0] ?? now;
    const retryAfter = Math.ceil((oldest + rule.windowSeconds * 1000 - now) / 1000);
    memWindows.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }

  timestamps.push(now);
  memWindows.set(key, timestamps);
  return { allowed: true, remaining: rule.limit - timestamps.length, retryAfter: 0 };
}

// periodic cleanup for in-memory fallback (prevent unbounded growth)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memWindows) {
    const filtered = timestamps.filter(t => t > now - 3600_000);
    if (filtered.length === 0) memWindows.delete(key);
    else memWindows.set(key, filtered);
  }
}, 60_000).unref();

function hashPii(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function logViolation(category: string, identifier: string, count: number, limitMax: number) {
  const hashed = hashPii(identifier);
  sql`
    INSERT INTO app.rate_limit_log (category, identifier, blocked, count, limit_max)
    VALUES (${category}, ${hashed}, true, ${count}, ${limitMax})
  `.catch(err => {
    logger.warn('rate limit audit log failed', { category, error: (err as Error).message });
  });
}

export async function checkRateLimit(
  category: string,
  identifier: string,
): Promise<NextResponse | null> {
  const rule = RATE_LIMITS[category];
  if (!rule) {
    logger.warn('unknown rate limit category', { category });
    return null; // fail open for unknown categories
  }

  // hash tag for cluster slot consistency: rl:{identifier}:category
  const key = `rl:{${identifier}}:${category}`;
  const now = Date.now();

  let result: RateLimitResult;

  if (redisReady) {
    try {
      result = await redisCheck(key, rule, now);
    } catch (err) {
      logger.warn('redis rate limit failed, falling back to memory', {
        category, error: (err as Error).message,
      });
      result = memCheck(key, rule, now);
    }
  } else {
    result = memCheck(key, rule, now);
  }

  if (!result.allowed) {
    logger.info('rate limit exceeded', { category, identifier: hashPii(identifier) });
    logViolation(category, identifier, rule.limit, rule.limit);
    void Metrics.rateLimitViolation(category);

    return NextResponse.json(
      { error: 'Too many requests. Please try again later.', retryAfter: result.retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(rule.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  return null; // allowed — continue with the request
}

// helper to extract client IP from request headers (CloudFront/Amplify)
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}
