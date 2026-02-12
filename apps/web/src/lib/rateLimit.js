/**
 * Rate Limiting Utilities
 *
 * Purpose: Protect authentication endpoints from brute force attacks.
 * Implementation: In-memory store (per-process); scales to multiple servers with Redis.
 * Trade-off: Simple, no external dependencies; resets on server restart.
 */

// In-memory storage for login attempts: { "login:email": { count, resetTime } }
const loginAttempts = new Map();

/**
 * Configuration for rate limiting behavior
 */
const RATE_LIMIT_CONFIG = {
    // Maximum failed attempts before lockout
    MAX_ATTEMPTS: 5,
    // Time window in milliseconds (15 minutes)
    WINDOW_MS: 15 * 60 * 1000,
    // Lock duration after exceeding attempts (30 minutes)
    LOCK_DURATION_MS: 30 * 60 * 1000
};

/**
 * Checks if an email has exceeded login attempt limits.
 * Tracks failed attempts; locks account after MAX_ATTEMPTS in time window.
 *
 * @param {string} email - User email address
 * @returns {boolean} True if account is currently rate-limited
 */
export function isRateLimited(email) {
    const key = `login:${email}`;
    const now = Date.now();
    const attempts = loginAttempts.get(key);

    // No attempts yet - not rate limited
    if (!attempts) {
        return false;
    }

    // Time window expired - reset and allow login
    if (now > attempts.resetTime) {
        loginAttempts.delete(key);
        return false;
    }

    // Still in time window and exceeded attempts - rate limited
    return attempts.count >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS;
}

/**
 * Records a failed login attempt for an email.
 * Locks account if MAX_ATTEMPTS exceeded within time window.
 *
 * @param {string} email - User email address
 */
export function recordFailedAttempt(email) {
    const key = `login:${email}`;
    const now = Date.now();
    let attempts = loginAttempts.get(key);

    // Initialize or reset if window expired
    if (!attempts || now > attempts.resetTime) {
        attempts = {
            count: 0,
            resetTime: now + RATE_LIMIT_CONFIG.WINDOW_MS
        };
    }

    attempts.count++;
    loginAttempts.set(key, attempts);
}

/**
 * Clears failed attempt count for an email (called after successful login).
 * Resets the rate limit state.
 *
 * @param {string} email - User email address
 */
export function clearFailedAttempts(email) {
    const key = `login:${email}`;
    loginAttempts.delete(key);
}

/**
 * Gets the remaining time (in seconds) until the rate limit resets.
 * Useful for error messages: "Try again in X minutes"
 *
 * @param {string} email - User email address
 * @returns {number} Seconds until rate limit resets (0 if not rate limited)
 */
export function getRateLimitResetTime(email) {
    const key = `login:${email}`;
    const attempts = loginAttempts.get(key);

    if (!attempts) {
        return 0;
    }

    const now = Date.now();
    const remainingMs = attempts.resetTime - now;

    return Math.max(0, Math.ceil(remainingMs / 1000));
}
