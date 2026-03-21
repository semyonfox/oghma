/**
 * Authentication Rate Limiting & Account Lockout
 *
 * Purpose: Protect authentication endpoints from brute force attacks.
 * - Rate limiting: Tracks failed login attempts in a sliding window (15 min)
 * - Account lockout: Locks account after exceeding max attempts (30 min)
 *
 * Implementation: Redis-backed (shared across instances) with in-memory
 * fallback when Redis is unavailable (local dev, connection failure).
 * Email keys are normalized with toLowerCase().trim() to prevent bypass.
 */

import { redis, redisReady } from '@/lib/redis';
import logger from '@/lib/logger';

// in-memory fallback for when redis is unavailable
const authProtection = new Map();

/**
 * Configuration for rate limiting & account lockout behavior
 */
const CONFIG = {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000,      // 15 min sliding window for rate limiting
    LOCK_DURATION_MS: 30 * 60 * 1000, // 30 min account lockout duration
    WINDOW_SECS: 15 * 60,            // 15 min in seconds (for redis TTL)
    LOCK_SECS: 30 * 60,              // 30 min in seconds (for redis TTL)
};

// redis key prefixes
const KEY = {
    attempts: (email) => `ratelimit:attempts:${email}`,
    window:   (email) => `ratelimit:window:${email}`,
    lockout:  (email) => `ratelimit:lockout:${email}`,
};

function normalize(email) {
    return email.toLowerCase().trim();
}

function useRedis() {
    return redisReady;
}

// ── Redis-backed implementations ────────────────────────────────────────────

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
        pipeline.set(KEY.attempts(email), '1', 'EX', CONFIG.WINDOW_SECS);
        pipeline.set(KEY.window(email), String(windowReset), 'EX', CONFIG.WINDOW_SECS);
        await pipeline.exec();

        // first attempt can never trigger lockout (need MAX_ATTEMPTS)
        return;
    }

    // increment within existing window
    const newCount = await redis.incr(KEY.attempts(email));

    // lock account if threshold exceeded
    if (newCount >= CONFIG.MAX_ATTEMPTS) {
        const lockUntil = now + CONFIG.LOCK_DURATION_MS;
        await redis.set(KEY.lockout(email), String(lockUntil), 'EX', CONFIG.LOCK_SECS);
    }
}

async function redisClearFailedAttempts(email) {
    await redis.del(
        KEY.attempts(email),
        KEY.window(email),
        KEY.lockout(email),
    );
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

// ── In-memory fallback implementations ──────────────────────────────────────

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

// ── Public API (async, redis-first with fallback) ───────────────────────────

/**
 * Checks if an account is currently locked due to too many failed attempts.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isAccountLocked(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            return await redisIsAccountLocked(email);
        } catch (err) {
            logger.warn('redis rate-limit read failed, falling back to memory', { fn: 'isAccountLocked', message: err.message });
        }
    }
    return memIsAccountLocked(email);
}

/**
 * Checks if an email has exceeded rate limit attempts in the current window.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isRateLimited(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            return await redisIsRateLimited(email);
        } catch (err) {
            logger.warn('redis rate-limit read failed, falling back to memory', { fn: 'isRateLimited', message: err.message });
        }
    }
    return memIsRateLimited(email);
}

/**
 * Records a failed login attempt for an account.
 * Locks the account if MAX_ATTEMPTS is exceeded.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function recordFailedAttempt(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            await redisRecordFailedAttempt(email);
            return;
        } catch (err) {
            logger.warn('redis rate-limit write failed, falling back to memory', { fn: 'recordFailedAttempt', message: err.message });
        }
    }
    memRecordFailedAttempt(email);
}

/**
 * Clears failed attempt count for an email (called after successful login).
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function clearFailedAttempts(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            await redisClearFailedAttempts(email);
            return;
        } catch (err) {
            logger.warn('redis rate-limit write failed, falling back to memory', { fn: 'clearFailedAttempts', message: err.message });
        }
    }
    memClearFailedAttempts(email);
}

/**
 * Gets the remaining time (in minutes) until the account unlock.
 * @param {string} email
 * @returns {Promise<number>} Minutes remaining until unlock (0 if not locked)
 */
export async function getLockoutMinutesRemaining(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            return await redisGetLockoutMinutesRemaining(email);
        } catch (err) {
            logger.warn('redis rate-limit read failed, falling back to memory', { fn: 'getLockoutMinutesRemaining', message: err.message });
        }
    }
    return memGetLockoutMinutesRemaining(email);
}

/**
 * Gets the remaining time (in seconds) until the rate limit resets.
 * @param {string} email
 * @returns {Promise<number>} Seconds until rate limit resets (0 if not rate limited)
 */
export async function getRateLimitResetTime(email) {
    email = normalize(email);
    if (useRedis()) {
        try {
            return await redisGetRateLimitResetTime(email);
        } catch (err) {
            logger.warn('redis rate-limit read failed, falling back to memory', { fn: 'getRateLimitResetTime', message: err.message });
        }
    }
    return memGetRateLimitResetTime(email);
}
