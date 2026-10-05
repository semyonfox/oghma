// auth rate limiting — redis-backed with in-memory fallback
// 5 attempts per 15 min window, 30 min lockout on exceed

import { ensureRedisReady, redis, redisReady } from "@/lib/redis";
import logger from "@/lib/logger";

interface AuthProtectionState {
  count: number;
  windowResetTime: number;
  lockedUntil: number;
  lastAttempt: number;
}

type RedisPipelineResults = Array<[Error | null, unknown]> | null;

const authProtection = new Map<string, AuthProtectionState>();

const CONFIG = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000, // 15 min sliding window for rate limiting
  LOCK_DURATION_MS: 30 * 60 * 1000, // 30 min account lockout duration
  WINDOW_SECS: 15 * 60, // 15 min in seconds (for redis TTL)
  LOCK_SECS: 30 * 60, // 30 min in seconds (for redis TTL)
};

// redis key prefixes
const KEY = {
  attempts: (email: string) => `ratelimit:attempts:${email}`,
  window: (email: string) => `ratelimit:window:${email}`,
  lockout: (email: string) => `ratelimit:lockout:${email}`,
};

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export class AuthLockoutStoreUnavailableError extends Error {
  constructor(message = "redis not ready after initialization") {
    super(message);
    this.name = "AuthLockoutStoreUnavailableError";
  }
}

export function isAuthLockoutStoreUnavailableError(
  error: unknown,
): error is AuthLockoutStoreUnavailableError {
  return (
    error instanceof AuthLockoutStoreUnavailableError ||
    (error instanceof Error &&
      error.name === "AuthLockoutStoreUnavailableError")
  );
}

function failOpen(): boolean {
  return process.env.AUTH_LOCKOUT_FAIL_OPEN === "true";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function canUseRedis(): Promise<boolean> {
  try {
    return redisReady || (await ensureRedisReady());
  } catch (err) {
    logger.error("redis rate-limit readiness check failed", {
      fn: "canUseRedis",
      message: errorMessage(err),
    });
    return false;
  }
}

function storeUnavailableError(
  fn: string,
  err: unknown,
): AuthLockoutStoreUnavailableError {
  const message = errorMessage(err ?? "redis not ready after initialization");
  logger.error("redis auth lockout store unavailable", {
    fn,
    message,
    failOpen: failOpen(),
  });
  return new AuthLockoutStoreUnavailableError(message);
}

function redisNotReadyError(fn: string): AuthLockoutStoreUnavailableError {
  return storeUnavailableError(fn, new Error("redis not ready after initialization"));
}

function assertPipelineSucceeded(
  results: RedisPipelineResults,
  fn: string,
): void {
  if (!results) throw new Error(`${fn} pipeline returned null`);
  const commandError = results.find(([error]) => error)?.[0];
  if (commandError) throw commandError;
}

async function redisIsAccountLocked(email: string): Promise<boolean> {
  const lockUntil = await redis.get(KEY.lockout(email));
  if (!lockUntil) return false;

  const now = Date.now();
  if (now >= parseInt(lockUntil, 10)) {
    // lock expired, clean up
    await redis.del(KEY.lockout(email));
    return false;
  }
  return true;
}

async function redisIsRateLimited(email: string): Promise<boolean> {
  const [countStr, windowResetStr] = await redis.mget(
    KEY.attempts(email),
    KEY.window(email),
  );
  if (!countStr) return false;

  const now = Date.now();
  if (windowResetStr && now > parseInt(windowResetStr, 10)) {
    // window expired, clean up
    await redis.del(KEY.attempts(email), KEY.window(email));
    return false;
  }

  return parseInt(countStr, 10) >= CONFIG.MAX_ATTEMPTS;
}

async function redisRecordFailedAttempt(email: string): Promise<void> {
  const now = Date.now();
  const windowResetStr = await redis.get(KEY.window(email));

  // reset if window expired or no window exists
  if (!windowResetStr || now > parseInt(windowResetStr, 10)) {
    const windowReset = now + CONFIG.WINDOW_MS;
    // set count to 1 and window reset time atomically with pipeline
    const pipeline = redis.pipeline();
    pipeline.set(KEY.attempts(email), "1", "EX", CONFIG.WINDOW_SECS);
    pipeline.set(
      KEY.window(email),
      String(windowReset),
      "EX",
      CONFIG.WINDOW_SECS,
    );
    assertPipelineSucceeded(
      await pipeline.exec(),
      "redisRecordFailedAttempt",
    );

    // first attempt can never trigger lockout (need MAX_ATTEMPTS)
    return;
  }

  // increment within existing window
  const newCount = await redis.incr(KEY.attempts(email));

  // lock account if threshold exceeded
  if (newCount >= CONFIG.MAX_ATTEMPTS) {
    const lockUntil = now + CONFIG.LOCK_DURATION_MS;
    await redis.set(
      KEY.lockout(email),
      String(lockUntil),
      "EX",
      CONFIG.LOCK_SECS,
    );
  }
}

async function redisClearFailedAttempts(email: string): Promise<void> {
  await redis.del(KEY.attempts(email), KEY.window(email), KEY.lockout(email));
}

async function redisGetLockoutMinutesRemaining(email: string): Promise<number> {
  const lockUntil = await redis.get(KEY.lockout(email));
  if (!lockUntil) return 0;

  const remainingMs = parseInt(lockUntil, 10) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}

async function redisGetRateLimitResetTime(email: string): Promise<number> {
  const windowReset = await redis.get(KEY.window(email));
  if (!windowReset) return 0;

  const remainingMs = parseInt(windowReset, 10) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function memIsAccountLocked(email: string): boolean {
  const state = authProtection.get(email);
  if (!state) return false;

  const now = Date.now();
  if (now >= state.lockedUntil) {
    authProtection.delete(email);
    return false;
  }
  return true;
}

function memIsRateLimited(email: string): boolean {
  const state = authProtection.get(email);
  if (!state) return false;

  const now = Date.now();
  if (now > state.windowResetTime) {
    authProtection.delete(email);
    return false;
  }
  return state.count >= CONFIG.MAX_ATTEMPTS;
}

function memRecordFailedAttempt(email: string): void {
  const now = Date.now();
  let state = authProtection.get(email);

  if (!state || now > state.windowResetTime) {
    state = {
      count: 0,
      windowResetTime: now + CONFIG.WINDOW_MS,
      lockedUntil: 0,
      lastAttempt: now,
    };
  }

  state.count++;
  state.lastAttempt = now;

  if (state.count >= CONFIG.MAX_ATTEMPTS) {
    state.lockedUntil = now + CONFIG.LOCK_DURATION_MS;
  }

  authProtection.set(email, state);
}

function memClearFailedAttempts(email: string): void {
  authProtection.delete(email);
}

function memGetLockoutMinutesRemaining(email: string): number {
  const state = authProtection.get(email);
  if (!state || !state.lockedUntil) return 0;

  const remainingMs = state.lockedUntil - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}

function memGetRateLimitResetTime(email: string): number {
  const state = authProtection.get(email);
  if (!state) return 0;

  const remainingMs = state.windowResetTime - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export async function isAccountLocked(email: string): Promise<boolean> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      return await redisIsAccountLocked(email);
    } catch (err) {
      if (!failOpen()) {
        storeUnavailableError("isAccountLocked", err);
        return false;
      }
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "isAccountLocked",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    redisNotReadyError("isAccountLocked");
    return false;
  }
  return memIsAccountLocked(email);
}

export async function isRateLimited(email: string): Promise<boolean> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      return await redisIsRateLimited(email);
    } catch (err) {
      if (!failOpen()) {
        storeUnavailableError("isRateLimited", err);
        return true;
      }
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "isRateLimited",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    redisNotReadyError("isRateLimited");
    return true;
  }
  return memIsRateLimited(email);
}

export async function recordFailedAttempt(email: string): Promise<void> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      await redisRecordFailedAttempt(email);
      return;
    } catch (err) {
      if (!failOpen()) throw storeUnavailableError("recordFailedAttempt", err);
      logger.warn("redis rate-limit write failed, falling back to memory", {
        fn: "recordFailedAttempt",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    throw redisNotReadyError("recordFailedAttempt");
  }
  memRecordFailedAttempt(email);
}

export async function clearFailedAttempts(email: string): Promise<void> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      await redisClearFailedAttempts(email);
      return;
    } catch (err) {
      if (!failOpen()) {
        storeUnavailableError("clearFailedAttempts", err);
        return;
      }
      logger.warn("redis rate-limit write failed, falling back to memory", {
        fn: "clearFailedAttempts",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    redisNotReadyError("clearFailedAttempts");
    return;
  }
  memClearFailedAttempts(email);
}

export async function getLockoutMinutesRemaining(email: string): Promise<number> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      return await redisGetLockoutMinutesRemaining(email);
    } catch (err) {
      if (!failOpen()) {
        storeUnavailableError("getLockoutMinutesRemaining", err);
        return 0;
      }
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "getLockoutMinutesRemaining",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    redisNotReadyError("getLockoutMinutesRemaining");
    return 0;
  }
  return memGetLockoutMinutesRemaining(email);
}

export async function getRateLimitResetTime(email: string): Promise<number> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      return await redisGetRateLimitResetTime(email);
    } catch (err) {
      if (!failOpen()) {
        storeUnavailableError("getRateLimitResetTime", err);
        return 0;
      }
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "getRateLimitResetTime",
        message: errorMessage(err),
      });
    }
  } else if (!failOpen()) {
    redisNotReadyError("getRateLimitResetTime");
    return 0;
  }
  return memGetRateLimitResetTime(email);
}

const RESERVE_LOGIN_ATTEMPT = `
local now = tonumber(ARGV[1])
local locked = tonumber(redis.call('GET', KEYS[3]) or '0')
if locked > now then return 0 end
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
  redis.call('SET', KEYS[2], now + tonumber(ARGV[2]) * 1000, 'EX', ARGV[2])
end
if count >= tonumber(ARGV[3]) then
  redis.call('SET', KEYS[3], now + tonumber(ARGV[4]) * 1000, 'EX', ARGV[4])
end
if count > tonumber(ARGV[3]) then return 0 end
return 1
`;

// reserve before bcrypt so concurrent requests and both login routes share one budget
export async function reserveLoginAttempt(email: string): Promise<boolean> {
  email = normalize(email);
  if (await canUseRedis()) {
    try {
      return await redis.eval(RESERVE_LOGIN_ATTEMPT, 3,
        KEY.attempts(email), KEY.window(email), KEY.lockout(email),
        Date.now(), CONFIG.WINDOW_SECS, CONFIG.MAX_ATTEMPTS, CONFIG.LOCK_SECS) === 1;
    } catch (error) {
      if (!failOpen()) throw storeUnavailableError("reserveLoginAttempt", error);
    }
  } else if (!failOpen()) {
    throw redisNotReadyError("reserveLoginAttempt");
  }
  if (memIsAccountLocked(email) || memIsRateLimited(email)) return false;
  memRecordFailedAttempt(email);
  return true;
}
