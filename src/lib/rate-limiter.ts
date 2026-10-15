// generic sliding-window rate limiter backed by Redis
// uses sorted sets for true sliding window — no burst-at-boundary problem
// violations are logged to PostgreSQL for audit (fire-and-forget)
// see rate-limit-config.ts for which rules fail open or closed when Redis is down

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { ensureRedisReady, redis, redisReady } from "@/lib/redis";
import {
  RATE_LIMITS,
  type RateLimitCategory,
  type RateLimitRule,
} from "@/lib/rate-limit-config";
import { Metrics } from "@/lib/metrics";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";

// in-memory fallback for when redis is unavailable
const memWindows = new Map<string, number[]>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window slides enough to allow next request
}

async function redisCheck(
  key: string,
  rule: RateLimitRule,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = now - rule.windowSeconds * 1000;

  const member = `${now}:${randomUUID()}`;

  // MULTI so the count and the add cannot interleave with another app
  // instance checking the same key: remove expired + count + add current + set TTL
  const results = await redis
    .multi()
    .zremrangebyscore(key, "-inf", windowStart)
    .zcard(key)
    .zadd(key, now, member)
    .expire(key, rule.windowSeconds)
    .exec();
  if (!results) throw new Error("rate limit transaction aborted");
  const commandError = results.find(([error]) => error)?.[0];
  if (commandError) throw commandError;

  const count = Number(results[1]?.[1] ?? 0);

  if (count >= rule.limit) {
    // a rejected request must not count. remove exactly our entry: a
    // concurrent request in the same millisecond has a different member
    await redis.zrem(key, member);

    // get the oldest entry to calculate retryAfter
    const oldest = await redis.zrange(key, "0", "0", "WITHSCORES");
    const oldestTs = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
    const retryAfter = Math.ceil(
      (oldestTs + rule.windowSeconds * 1000 - now) / 1000,
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  return { allowed: true, remaining: rule.limit - count - 1, retryAfter: 0 };
}

function memCheck(
  key: string,
  rule: RateLimitRule,
  now: number,
): RateLimitResult {
  const windowStart = now - rule.windowSeconds * 1000;
  let timestamps = memWindows.get(key) ?? [];

  // slide window: remove expired
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= rule.limit) {
    const oldest = timestamps[0] ?? now;
    const retryAfter = Math.ceil(
      (oldest + rule.windowSeconds * 1000 - now) / 1000,
    );
    memWindows.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  timestamps.push(now);
  memWindows.set(key, timestamps);
  return {
    allowed: true,
    remaining: rule.limit - timestamps.length,
    retryAfter: 0,
  };
}

// the longest window any rule uses. pruning with a shorter fixed window would
// forget hits that still count for a longer rule
const MAX_WINDOW_MS =
  Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.windowSeconds)) *
  1000;

// periodic cleanup for in-memory fallback (prevent unbounded growth)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memWindows) {
    const filtered = timestamps.filter((t) => t > now - MAX_WINDOW_MS);
    if (filtered.length === 0) memWindows.delete(key);
    else memWindows.set(key, filtered);
  }
}, 60_000).unref();

function hashPii(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function logViolation(
  category: string,
  identifier: string,
  count: number,
  limitMax: number,
) {
  const hashed = hashPii(identifier);
  // async wrapper so a synchronous throw from the lazy client is caught too,
  // the audit write must never turn a 429 into a 500
  void (async () => {
    await sql`
      INSERT INTO app.rate_limit_log (category, identifier, blocked, count, limit_max)
      VALUES (${category}, ${hashed}, true, ${count}, ${limitMax})
    `;
  })().catch((err: unknown) => {
    logger.warn("rate limit audit log failed", {
      category,
      error: (err as Error).message,
    });
  });
}

function rateLimitStoreUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Service temporarily unavailable. Please try again shortly." },
    {
      status: 503,
      headers: {
        "Retry-After": "30",
      },
    },
  );
}

function failClosedStoreUnavailable(
  category: string,
  error: string,
): NextResponse {
  logger.error("redis rate limit failed for fail-closed category", {
    category,
    error,
    publicStatus: 503,
    retryAfterSeconds: 30,
  });
  void Metrics.rateLimitViolation(`${category}:store-unavailable`);
  return rateLimitStoreUnavailableResponse();
}

export async function checkRateLimit(
  category: RateLimitCategory,
  identifier: string,
): Promise<NextResponse | null> {
  const rule: RateLimitRule = RATE_LIMITS[category];

  // hash tag for cluster slot consistency: rl:{identifier}:category
  const key = `rl:{${identifier}}:${category}`;
  const now = Date.now();

  let result: RateLimitResult;

  const canUseRedis = redisReady || (await ensureRedisReady());
  if (canUseRedis) {
    try {
      result = await redisCheck(key, rule, now);
    } catch (err) {
      const error = (err as Error).message;
      if (rule.failClosedOnStoreError) {
        return failClosedStoreUnavailable(category, error);
      }

      logger.warn("redis rate limit failed, falling back to memory", {
        category,
        error,
      });
      result = memCheck(key, rule, now);
    }
  } else {
    if (rule.failClosedOnStoreError) {
      return failClosedStoreUnavailable(
        category,
        "redis not ready after initialization",
      );
    }

    result = memCheck(key, rule, now);
  }

  if (!result.allowed) {
    logger.info("rate limit exceeded", {
      category,
      identifier: hashPii(identifier),
    });
    logViolation(category, identifier, rule.limit, rule.limit);
    void Metrics.rateLimitViolation(category);

    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(rule.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  return null; // allowed — continue with the request
}

// the homelab nginx overwrites X-Forwarded-For and X-Real-IP with Cloudflare's
// CF-Connecting-IP, so the first entry is the real client. behind a proxy that
// appends instead, the first entry is client-controlled and IP limits are bypassable
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}
