// auth rate limiting — redis-backed with in-memory fallback
// 5 attempts per 15 min window, 30 min lockout on exceed

import { redis, redisReady } from "@/lib/redis";
import logger from "@/lib/logger";

const authProtection = new Map();

const CONFIG = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000, // 15 min sliding window for rate limiting
  LOCK_DURATION_MS: 30 * 60 * 1000, // 30 min account lockout duration
  WINDOW_SECS: 15 * 60, // 15 min in seconds (for redis TTL)
  LOCK_SECS: 30 * 60, // 30 min in seconds (for redis TTL)
};

// redis key prefixes
const KEY = {
  attempts: (email) => `ratelimit:attempts:${email}`,
  window: (email) => `ratelimit:window:${email}`,
  lockout: (email) => `ratelimit:lockout:${email}`,
};

function normalize(email) {
  return email.toLowerCase().trim();
}

function canUseRedis() {
  return redisReady;
}

async function redisIsAccountLocked(email) {
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

async function redisIsRateLimited(email) {
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

async function redisRecordFailedAttempt(email) {
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
    await pipeline.exec();

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

async function redisClearFailedAttempts(email) {
  await redis.del(KEY.attempts(email), KEY.window(email), KEY.lockout(email));
}

async function redisGetLockoutMinutesRemaining(email) {
  const lockUntil = await redis.get(KEY.lockout(email));
  if (!lockUntil) return 0;

  const remainingMs = parseInt(lockUntil, 10) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}

async function redisGetRateLimitResetTime(email) {
  const windowReset = await redis.get(KEY.window(email));
  if (!windowReset) return 0;

  const remainingMs = parseInt(windowReset, 10) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function memIsAccountLocked(email) {
  const state = authProtection.get(email);
  if (!state) return false;

  const now = Date.now();
  if (now >= state.lockedUntil) {
    authProtection.delete(email);
    return false;
  }
  return true;
}

function memIsRateLimited(email) {
  const state = authProtection.get(email);
  if (!state) return false;

  const now = Date.now();
  if (now > state.windowResetTime) {
    authProtection.delete(email);
    return false;
  }
  return state.count >= CONFIG.MAX_ATTEMPTS;
}

function memRecordFailedAttempt(email) {
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

function memClearFailedAttempts(email) {
  authProtection.delete(email);
}

function memGetLockoutMinutesRemaining(email) {
  const state = authProtection.get(email);
  if (!state || !state.lockedUntil) return 0;

  const remainingMs = state.lockedUntil - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}

function memGetRateLimitResetTime(email) {
  const state = authProtection.get(email);
  if (!state) return 0;

  const remainingMs = state.windowResetTime - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export async function isAccountLocked(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      return await redisIsAccountLocked(email);
    } catch (err) {
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "isAccountLocked",
        message: err.message,
      });
    }
  }
  return memIsAccountLocked(email);
}

export async function isRateLimited(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      return await redisIsRateLimited(email);
    } catch (err) {
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "isRateLimited",
        message: err.message,
      });
    }
  }
  return memIsRateLimited(email);
}

export async function recordFailedAttempt(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      await redisRecordFailedAttempt(email);
      return;
    } catch (err) {
      logger.warn("redis rate-limit write failed, falling back to memory", {
        fn: "recordFailedAttempt",
        message: err.message,
      });
    }
  }
  memRecordFailedAttempt(email);
}

export async function clearFailedAttempts(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      await redisClearFailedAttempts(email);
      return;
    } catch (err) {
      logger.warn("redis rate-limit write failed, falling back to memory", {
        fn: "clearFailedAttempts",
        message: err.message,
      });
    }
  }
  memClearFailedAttempts(email);
}

export async function getLockoutMinutesRemaining(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      return await redisGetLockoutMinutesRemaining(email);
    } catch (err) {
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "getLockoutMinutesRemaining",
        message: err.message,
      });
    }
  }
  return memGetLockoutMinutesRemaining(email);
}

export async function getRateLimitResetTime(email) {
  email = normalize(email);
  if (canUseRedis()) {
    try {
      return await redisGetRateLimitResetTime(email);
    } catch (err) {
      logger.warn("redis rate-limit read failed, falling back to memory", {
        fn: "getRateLimitResetTime",
        message: err.message,
      });
    }
  }
  return memGetRateLimitResetTime(email);
}
