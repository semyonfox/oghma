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

const CLIENT = "203.0.113.10";

const EMAIL = "lockout-test@example.com";

async function reserveTimes(count: number, email = EMAIL): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < count; i++) results.push(await reserveLoginAttempt(email, CLIENT));
  return results;
}

beforeEach(async () => {
  vi.useFakeTimers();
  await clearFailedAttempts(EMAIL, CLIENT);
  await clearFailedAttempts("other@example.com", CLIENT);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  delete process.env.AUTH_LOCKOUT_FAIL_OPEN;
});

describe("reserveLoginAttempt memory fallback", () => {
  it("locks only the client that kept guessing, so the owner can still sign in elsewhere", async () => {
    expect(await reserveTimes(6)).toEqual([true, true, true, true, true, false]);
    expect(await reserveLoginAttempt(EMAIL, "198.51.100.20")).toBe(true);
    expect(await getLockoutMinutesRemaining(EMAIL, "198.51.100.20")).toBe(0);
  });

  it("still bounds a guesser spread across many clients per address", async () => {
    const results: boolean[] = [];
    for (let client = 0; client < 25; client++) {
      results.push(await reserveLoginAttempt(EMAIL, `198.51.100.${client}`));
    }
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(await reserveLoginAttempt(EMAIL, "192.0.2.99")).toBe(false);
    await clearFailedAttempts(EMAIL, "192.0.2.99");
    expect(await reserveLoginAttempt(EMAIL, "192.0.2.99")).toBe(true);
  });

  // regression: the old fallback dropped the counter whenever no lock was active,
  // so repeated attempts through reserveLoginAttempt never locked anything
  it("allows five attempts and then locks the address", async () => {
    expect(await reserveTimes(6)).toEqual([true, true, true, true, true, false]);
    expect(await getLockoutMinutesRemaining(EMAIL, CLIENT)).toBe(30);
  });

  it("keeps the lock for 30 minutes and then starts a fresh window", async () => {
    await reserveTimes(5);
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(await reserveLoginAttempt(EMAIL, CLIENT)).toBe(false);
    expect(await getLockoutMinutesRemaining(EMAIL, CLIENT)).toBe(1);

    vi.advanceTimersByTime(60 * 1000);
    expect(await getLockoutMinutesRemaining(EMAIL, CLIENT)).toBe(0);
    expect(await reserveTimes(5)).toEqual([true, true, true, true, true]);
  });

  it("resets the count when the 15 minute window passes without a lock", async () => {
    await reserveTimes(4);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await reserveTimes(4)).toEqual([true, true, true, true]);
    expect(await getLockoutMinutesRemaining(EMAIL, CLIENT)).toBe(0);
  });

  it("clears the count after a successful login", async () => {
    await reserveTimes(4);
    await clearFailedAttempts(EMAIL, CLIENT);
    expect(await reserveTimes(4)).toEqual([true, true, true, true]);
  });

  it("shares one budget across case and whitespace variants", async () => {
    await reserveTimes(3, EMAIL);
    await reserveTimes(2, `  ${EMAIL.toUpperCase()} `);
    expect(await reserveLoginAttempt(EMAIL, CLIENT)).toBe(false);
  });

  it("tracks addresses independently", async () => {
    await reserveTimes(5);
    expect(await reserveLoginAttempt("other@example.com", CLIENT)).toBe(true);
  });
});
