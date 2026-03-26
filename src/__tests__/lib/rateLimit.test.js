import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// mock redis module so tests use the in-memory fallback without
// attempting a real connection
vi.mock('@/lib/redis', () => ({
    redis: {},
    redisReady: false,
}));

// mock logger to avoid winston init side effects in tests
vi.mock('@/lib/logger', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    isAccountLocked,
    isRateLimited,
    recordFailedAttempt,
    clearFailedAttempts,
    getLockoutMinutesRemaining,
    getRateLimitResetTime,
} from '@/lib/loginLockout.js';

const EMAIL = 'test@example.com';

beforeEach(async () => {
    vi.useFakeTimers();
    await clearFailedAttempts(EMAIL);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('recordFailedAttempt + isRateLimited', () => {
    it('is not rate limited with zero attempts', async () => {
        expect(await isRateLimited(EMAIL)).toBe(false);
    });

    it('is not rate limited below threshold (4 attempts)', async () => {
        for (let i = 0; i < 4; i++) await recordFailedAttempt(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(false);
    });

    it('is rate limited at exactly 5 attempts', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(true);
    });

    it('resets after the 15-minute window expires', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(true);

        // advance past the 15-minute window
        vi.advanceTimersByTime(15 * 60 * 1000 + 1);
        expect(await isRateLimited(EMAIL)).toBe(false);
    });
});

describe('isAccountLocked', () => {
    it('is not locked with no attempts', async () => {
        expect(await isAccountLocked(EMAIL)).toBe(false);
    });

    it('locks account after 5 failed attempts', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isAccountLocked(EMAIL)).toBe(true);
    });

    it('unlocks after 30-minute lockout duration', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isAccountLocked(EMAIL)).toBe(true);

        vi.advanceTimersByTime(30 * 60 * 1000);
        expect(await isAccountLocked(EMAIL)).toBe(false);
    });
});

describe('clearFailedAttempts', () => {
    it('resets rate limit and lockout state', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(true);
        expect(await isAccountLocked(EMAIL)).toBe(true);

        await clearFailedAttempts(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(false);
        expect(await isAccountLocked(EMAIL)).toBe(false);
    });
});

describe('getLockoutMinutesRemaining', () => {
    it('returns 0 when not locked', async () => {
        expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
    });

    it('returns ~30 minutes immediately after lockout', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        const mins = await getLockoutMinutesRemaining(EMAIL);
        expect(mins).toBeGreaterThanOrEqual(29);
        expect(mins).toBeLessThanOrEqual(30);
    });

    it('decreases over time', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        vi.advanceTimersByTime(10 * 60 * 1000); // 10 min
        const mins = await getLockoutMinutesRemaining(EMAIL);
        expect(mins).toBeGreaterThanOrEqual(19);
        expect(mins).toBeLessThanOrEqual(20);
    });
});

describe('getRateLimitResetTime', () => {
    it('returns 0 when no attempts recorded', async () => {
        expect(await getRateLimitResetTime(EMAIL)).toBe(0);
    });

    it('returns seconds until window reset', async () => {
        await recordFailedAttempt(EMAIL);
        const seconds = await getRateLimitResetTime(EMAIL);
        // should be close to 15 minutes in seconds
        expect(seconds).toBeGreaterThan(14 * 60);
        expect(seconds).toBeLessThanOrEqual(15 * 60);
    });
});

describe('isolation between emails', () => {
    it('does not affect a different email', async () => {
        for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
        expect(await isRateLimited(EMAIL)).toBe(true);
        expect(await isRateLimited('other@example.com')).toBe(false);
    });
});

describe('email normalization', () => {
    it('treats different cases of the same email as identical', async () => {
        await recordFailedAttempt('User@Example.COM');
        await recordFailedAttempt('user@example.com');
        await recordFailedAttempt('USER@EXAMPLE.COM');
        await recordFailedAttempt('  user@example.com  ');
        await recordFailedAttempt('user@example.com');
        expect(await isRateLimited('USER@Example.com')).toBe(true);
    });
});
