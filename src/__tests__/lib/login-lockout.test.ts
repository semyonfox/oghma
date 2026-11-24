import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  ready: false,
  ensureReady: vi.fn(async () => false),
  eval: vi.fn(),
  get: vi.fn(),
  mget: vi.fn(),
  del: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ default: logger }));

vi.mock("@/lib/redis", () => ({
  get redisReady() {
    return redisState.ready;
  },
  ensureRedisReady: redisState.ensureReady,
  redis: {
    eval: redisState.eval,
    get: redisState.get,
    mget: redisState.mget,
    del: redisState.del,
  },
}));

import {
  AuthLockoutStoreUnavailableError,
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

describe("reserveLoginAttempt memory fallback", () => {
  beforeEach(async () => {
    vi.stubEnv("AUTH_LOCKOUT_FAIL_OPEN", "true");
    vi.useFakeTimers();
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    await clearFailedAttempts(EMAIL, CLIENT);
    await clearFailedAttempts("other@example.com", CLIENT);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("locks only the client that kept guessing, so the owner can still sign in elsewhere", async () => {
    expect(await reserveTimes(6)).toEqual([true, true, true, true, true, false]);
    expect(await getLockoutMinutesRemaining(EMAIL, CLIENT)).toBe(30);
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

describe("login lockout with the shared redis store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_LOCKOUT_FAIL_OPEN", undefined);
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    redisState.eval.mockResolvedValue(1);
    redisState.get.mockResolvedValue(null);
    redisState.del.mockResolvedValue(0);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("blocks password login when redis is unavailable", async () => {
    await expect(reserveLoginAttempt("user@example.com", CLIENT)).rejects.toBeInstanceOf(
      AuthLockoutStoreUnavailableError,
    );
  });

  it("blocks password login when the reservation script fails", async () => {
    redisState.ready = true;
    redisState.eval.mockRejectedValue(new Error("READONLY"));
    await expect(reserveLoginAttempt("user@example.com", CLIENT)).rejects.toBeInstanceOf(
      AuthLockoutStoreUnavailableError,
    );
  });

  it("does not fall back to per-process memory unless fail-open is configured", async () => {
    redisState.ready = true;
    redisState.eval.mockRejectedValue(new Error("READONLY"));
    vi.stubEnv("AUTH_LOCKOUT_FAIL_OPEN", "true");
    await expect(reserveLoginAttempt("user@example.com", CLIENT)).resolves.toBe(true);
  });

  it("reserves against normalized keys once redis is lazily ready", async () => {
    redisState.ensureReady.mockResolvedValueOnce(true);
    redisState.eval.mockResolvedValueOnce(0);
    await expect(reserveLoginAttempt("  User@Example.com ", CLIENT)).resolves.toBe(false);
    expect(redisState.eval).toHaveBeenCalledWith(
      expect.any(String),
      3,
      "ratelimit:attempts:user@example.com|203.0.113.10",
      "ratelimit:window:user@example.com|203.0.113.10",
      "ratelimit:lockout:user@example.com|203.0.113.10",
      expect.any(Number),
      900,
      5,
      1800,
    );
  });

  it("reports the remaining lock in whole minutes", async () => {
    redisState.ready = true;
    redisState.mget.mockResolvedValue([String(Date.now() + 90_000), null]);
    await expect(getLockoutMinutesRemaining("user@example.com", CLIENT)).resolves.toBe(2);
  });

  it("does not fail a valid login when clearing the count fails", async () => {
    await expect(clearFailedAttempts("user@example.com", CLIENT)).resolves.toBeUndefined();
    redisState.ready = true;
    redisState.del.mockRejectedValue(new Error("READONLY"));
    await expect(clearFailedAttempts("user@example.com", CLIENT)).resolves.toBeUndefined();
  });
});
