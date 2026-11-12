import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("login lockout with the shared redis store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_LOCKOUT_FAIL_OPEN;
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    redisState.eval.mockResolvedValue(1);
    redisState.get.mockResolvedValue(null);
    redisState.del.mockResolvedValue(0);
  });

  it("blocks password login when redis is unavailable", async () => {
    await expect(reserveLoginAttempt("user@example.com", CLIENT)).rejects.toBeInstanceOf(
      AuthLockoutStoreUnavailableError,
    );
    expect(logger.error).toHaveBeenCalledWith(
      "redis auth lockout store unavailable",
      expect.objectContaining({ fn: "reserveLoginAttempt" }),
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
    process.env.AUTH_LOCKOUT_FAIL_OPEN = "true";
    await expect(reserveLoginAttempt("user@example.com", CLIENT)).resolves.toBe(true);
    expect(logger.warn).toHaveBeenCalled();
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
