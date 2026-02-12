/**
 * Account Lockout Utilities
 *
 * Purpose: Prevent brute force attacks by temporarily locking accounts after failed attempts.
 * Implementation: In-memory store tracking per-email lockout state.
 * Security: Works in conjunction with rate limiting for defense-in-depth.
 */

// In-memory storage for account lockout: { "email": { count, lockedUntil } }
const lockedAccounts = new Map();

/**
 * Configuration for account lockout behavior
 */
const LOCKOUT_CONFIG = {
    // Number of failed attempts before account locks
    MAX_ATTEMPTS: 5,
    // Duration of lockout (30 minutes)
    LOCK_DURATION_MS: 30 * 60 * 1000
};

/**
 * Checks if an account is currently locked due to too many failed attempts.
 * Automatically clears lock if duration has expired.
 *
 * @param {string} email - User email address
 * @returns {boolean} True if account is locked
 */
export function isAccountLocked(email) {
    const lockData = lockedAccounts.get(email);

    // No lock history - not locked
    if (!lockData) {
        return false;
    }

    const now = Date.now();

    // Lock period has expired - clear and allow login
    if (now >= lockData.lockedUntil) {
        lockedAccounts.delete(email);
        return false;
    }

    // Still within lock period
    return true;
}

/**
 * Records a failed login attempt for an account.
 * Locks the account if MAX_ATTEMPTS exceeded.
 *
 * @param {string} email - User email address
 */
export function recordFailedLogin(email) {
    const now = Date.now();
    let lockData = lockedAccounts.get(email);

    // Initialize if no prior attempts
    if (!lockData) {
        lockData = {
            count: 0,
            lockedUntil: null
        };
    }

    lockData.count++;
    lockData.lastAttempt = now;

    // Lock account if threshold exceeded
    if (lockData.count >= LOCKOUT_CONFIG.MAX_ATTEMPTS) {
        lockData.lockedUntil = now + LOCKOUT_CONFIG.LOCK_DURATION_MS;
    }

    lockedAccounts.set(email, lockData);
}

/**
 * Clears failed login attempts for an account (called after successful login).
 * Resets the lockout state.
 *
 * @param {string} email - User email address
 */
export function clearFailedLogins(email) {
    lockedAccounts.delete(email);
}

/**
 * Gets the remaining time (in minutes) until the account unlock.
 * Useful for error messages: "Account locked for X more minutes"
 *
 * @param {string} email - User email address
 * @returns {number} Minutes remaining until unlock (0 if not locked)
 */
export function getLockoutMinutesRemaining(email) {
    const lockData = lockedAccounts.get(email);

    if (!lockData || !lockData.lockedUntil) {
        return 0;
    }

    const now = Date.now();
    const remainingMs = lockData.lockedUntil - now;

    return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}
