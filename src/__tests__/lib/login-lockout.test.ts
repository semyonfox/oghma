import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_LOCKOUT_FAIL_OPEN = "true";

// fail-open mode with no redis exercises the per-process memory fallback
vi.mock("@/lib/redis", () => ({
  redis: {},
  redisReady: false,
  ensureRedisReady: vi.fn(async () => false),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  clearFailedAttempts,
  getLockoutMinutesRemaining,
  reserveLoginAttempt,
} from "@/lib/auth/login-lockout";

const EMAIL = "lockout-test@example.com";

async function reserveTimes(count: number, email = EMAIL): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < count; i++) results.push(await reserveLoginAttempt(email));
  return results;
}

beforeEach(async () => {
  vi.useFakeTimers();
  await clearFailedAttempts(EMAIL);
  await clearFailedAttempts("other@example.com");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  delete process.env.AUTH_LOCKOUT_FAIL_OPEN;
});

describe("reserveLoginAttempt memory fallback", () => {
  // regression: the old fallback dropped the counter whenever no lock was active,
  // so repeated attempts through reserveLoginAttempt never locked anything
  it("allows five attempts and then locks the address", async () => {
    expect(await reserveTimes(6)).toEqual([true, true, true, true, true, false]);
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(30);
  });

  it("keeps the lock for 30 minutes and then starts a fresh window", async () => {
    await reserveTimes(5);
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(await reserveLoginAttempt(EMAIL)).toBe(false);
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(1);

    vi.advanceTimersByTime(60 * 1000);
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
    expect(await reserveTimes(5)).toEqual([true, true, true, true, true]);
  });

  it("resets the count when the 15 minute window passes without a lock", async () => {
    await reserveTimes(4);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await reserveTimes(4)).toEqual([true, true, true, true]);
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
  });

  it("clears the count after a successful login", async () => {
    await reserveTimes(4);
    await clearFailedAttempts(EMAIL);
    expect(await reserveTimes(4)).toEqual([true, true, true, true]);
  });

  it("shares one budget across case and whitespace variants", async () => {
    await reserveTimes(3, EMAIL);
    await reserveTimes(2, `  ${EMAIL.toUpperCase()} `);
    expect(await reserveLoginAttempt(EMAIL)).toBe(false);
  });

  it("tracks addresses independently", async () => {
    await reserveTimes(5);
    expect(await reserveLoginAttempt("other@example.com")).toBe(true);
  });
});
