import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    isAccountLocked,
    isRateLimited,
    recordFailedAttempt,
    clearFailedAttempts,
    getLockoutMinutesRemaining,
    getRateLimitResetTime,
} from '@/lib/rateLimit.js';

const EMAIL = 'test@example.com';

beforeEach(() => {
    vi.useFakeTimers();
    clearFailedAttempts(EMAIL);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('recordFailedAttempt + isRateLimited', () => {
    it('is not rate limited with zero attempts', () => {
        expect(isRateLimited(EMAIL)).toBe(false);
    });

    it('is not rate limited below threshold (4 attempts)', () => {
        for (let i = 0; i < 4; i++) recordFailedAttempt(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(false);
    });

    it('is rate limited at exactly 5 attempts', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(true);
    });

    it('resets after the 15-minute window expires', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(true);

        // advance past the 15-minute window
        vi.advanceTimersByTime(15 * 60 * 1000 + 1);
        expect(isRateLimited(EMAIL)).toBe(false);
    });
});

describe('isAccountLocked', () => {
    it('is not locked with no attempts', () => {
        expect(isAccountLocked(EMAIL)).toBe(false);
    });

    it('locks account after 5 failed attempts', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isAccountLocked(EMAIL)).toBe(true);
    });

    it('unlocks after 30-minute lockout duration', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isAccountLocked(EMAIL)).toBe(true);

        vi.advanceTimersByTime(30 * 60 * 1000);
        expect(isAccountLocked(EMAIL)).toBe(false);
    });
});

describe('clearFailedAttempts', () => {
    it('resets rate limit and lockout state', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(true);
        expect(isAccountLocked(EMAIL)).toBe(true);

        clearFailedAttempts(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(false);
        expect(isAccountLocked(EMAIL)).toBe(false);
    });
});

describe('getLockoutMinutesRemaining', () => {
    it('returns 0 when not locked', () => {
        expect(getLockoutMinutesRemaining(EMAIL)).toBe(0);
    });

    it('returns ~30 minutes immediately after lockout', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        const mins = getLockoutMinutesRemaining(EMAIL);
        expect(mins).toBeGreaterThanOrEqual(29);
        expect(mins).toBeLessThanOrEqual(30);
    });

    it('decreases over time', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        vi.advanceTimersByTime(10 * 60 * 1000); // 10 min
        const mins = getLockoutMinutesRemaining(EMAIL);
        expect(mins).toBeGreaterThanOrEqual(19);
        expect(mins).toBeLessThanOrEqual(20);
    });
});

describe('getRateLimitResetTime', () => {
    it('returns 0 when no attempts recorded', () => {
        expect(getRateLimitResetTime(EMAIL)).toBe(0);
    });

    it('returns seconds until window reset', () => {
        recordFailedAttempt(EMAIL);
        const seconds = getRateLimitResetTime(EMAIL);
        // should be close to 15 minutes in seconds
        expect(seconds).toBeGreaterThan(14 * 60);
        expect(seconds).toBeLessThanOrEqual(15 * 60);
    });
});

describe('isolation between emails', () => {
    it('does not affect a different email', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL);
        expect(isRateLimited(EMAIL)).toBe(true);
        expect(isRateLimited('other@example.com')).toBe(false);
    });
});
