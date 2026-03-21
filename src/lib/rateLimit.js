/**
 * Authentication Rate Limiting & Account Lockout
 *
 * Purpose: Protect authentication endpoints from brute force attacks.
 * - Rate limiting: Tracks failed login attempts in a sliding window (15 min)
 * - Account lockout: Locks account after exceeding max attempts (30 min)
 *
 * Implementation: In-memory store (per-process); resets on server restart.
 * TODO: Scale to multiple servers using Redis for persistent lockout state.
 */

// Single in-memory storage for all auth protection: { "email": { count, lockedUntil, ... } }
const authProtection = new Map();

/**
 * Configuration for rate limiting & account lockout behavior
 */
const CONFIG = {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000,      // 15 min sliding window for rate limiting
    LOCK_DURATION_MS: 30 * 60 * 1000 // 30 min account lockout duration
};

/**
 * Checks if an account is currently locked due to too many failed attempts.
 * Automatically clears lock if duration has expired.
 *
 * @param {string} email - User email address
 * @returns {boolean} True if account is locked
 */
export function isAccountLocked(email) {
    email = email.toLowerCase().trim();
    const state = authProtection.get(email);
    if (!state) return false;

    const now = Date.now();
    // Lock period expired - auto-clear
    if (now >= state.lockedUntil) {
        authProtection.delete(email);
        return false;
    }

    return true;
}

/**
 * Checks if an email has exceeded rate limit attempts in the current window.
 *
 * @param {string} email - User email address
 * @returns {boolean} True if account is currently rate-limited
 */
export function isRateLimited(email) {
    email = email.toLowerCase().trim();
    const state = authProtection.get(email);
    if (!state) return false;

    const now = Date.now();
    // Window expired - reset
    if (now > state.windowResetTime) {
        authProtection.delete(email);
        return false;
    }

    return state.count >= CONFIG.MAX_ATTEMPTS;
}

/**
 * Records a failed login attempt for an account.
 * Locks the account if MAX_ATTEMPTS is exceeded.
 *
 * @param {string} email - User email address
 */
export function recordFailedAttempt(email) {
    email = email.toLowerCase().trim();
    const now = Date.now();
    let state = authProtection.get(email);

    // Initialize or reset if window expired
    if (!state || now > state.windowResetTime) {
        state = {
            count: 0,
            windowResetTime: now + CONFIG.WINDOW_MS,
            lockedUntil: 0,
            lastAttempt: now
        };
    }

    state.count++;
    state.lastAttempt = now;

    // Lock account if threshold exceeded
    if (state.count >= CONFIG.MAX_ATTEMPTS) {
        state.lockedUntil = now + CONFIG.LOCK_DURATION_MS;
    }

    authProtection.set(email, state);
}

/**
 * Clears failed attempt count for an email (called after successful login).
 * Resets both rate limit and lockout state.
 *
 * @param {string} email - User email address
 */
export function clearFailedAttempts(email) {
    email = email.toLowerCase().trim();
    authProtection.delete(email);
}

/**
 * Gets the remaining time (in minutes) until the account unlock.
 * Useful for error messages: "Account locked for X more minutes"
 *
 * @param {string} email - User email address
 * @returns {number} Minutes remaining until unlock (0 if not locked)
 */
export function getLockoutMinutesRemaining(email) {
    email = email.toLowerCase().trim();
    const state = authProtection.get(email);
    if (!state || !state.lockedUntil) return 0;

    const now = Date.now();
    const remainingMs = state.lockedUntil - now;

    return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}

/**
 * Gets the remaining time (in seconds) until the rate limit resets.
 * Useful for error messages: "Try again in X minutes"
 *
 * @param {string} email - User email address
 * @returns {number} Seconds until rate limit resets (0 if not rate limited)
 */
export function getRateLimitResetTime(email) {
    email = email.toLowerCase().trim();
    const state = authProtection.get(email);
    if (!state) return 0;

    const now = Date.now();
    const remainingMs = state.windowResetTime - now;

    return Math.max(0, Math.ceil(remainingMs / 1000));
}
