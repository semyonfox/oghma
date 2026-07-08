import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  ready: false,
  ensureReady: vi.fn(async () => false),
  get: vi.fn(),
  mget: vi.fn(),
  del: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  pipeline: vi.fn(),
}));

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@/lib/logger", () => ({ default: logger }));

vi.mock("@/lib/redis", () => ({
  get redisReady() {
    return redisState.ready;
  },
  ensureRedisReady: redisState.ensureReady,
  redis: {
    get: redisState.get,
    mget: redisState.mget,
    del: redisState.del,
    set: redisState.set,
    incr: redisState.incr,
    pipeline: redisState.pipeline,
  },
}));

describe("login lockout fail-closed mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.AUTH_LOCKOUT_FAIL_OPEN;
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    redisState.get.mockResolvedValue(null);
    redisState.mget.mockResolvedValue([null, null]);
    redisState.del.mockResolvedValue(0);
    redisState.set.mockResolvedValue("OK");
    redisState.incr.mockResolvedValue(1);
    redisState.pipeline.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  });

  it("blocks login rate checks when the store is unavailable", async () => {
    const { isRateLimited } = await import("@/lib/loginLockout.js");

    await expect(isRateLimited("user@example.com")).resolves.toBe(true);
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "redis auth lockout store unavailable",
      expect.objectContaining({
        fn: "isRateLimited",
        message: "redis not ready after initialization",
      }),
    );
  });

  it("throws a typed error when failed-attempt writes cannot be recorded", async () => {
    const {
      AuthLockoutStoreUnavailableError,
      recordFailedAttempt,
    } = await import("@/lib/loginLockout.js");

    await expect(recordFailedAttempt("user@example.com")).rejects.toBeInstanceOf(
      AuthLockoutStoreUnavailableError,
    );
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(redisState.mget).not.toHaveBeenCalled();
  });

  it("throws a typed error when first-attempt pipeline writes return command errors", async () => {
    redisState.ready = true;
    redisState.get.mockResolvedValue(null);
    redisState.pipeline.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [new Error("READONLY"), null],
        [null, "OK"],
      ]),
    });
    const {
      AuthLockoutStoreUnavailableError,
      recordFailedAttempt,
    } = await import("@/lib/loginLockout.js");

    await expect(recordFailedAttempt("user@example.com")).rejects.toBeInstanceOf(
      AuthLockoutStoreUnavailableError,
    );
    expect(logger.error).toHaveBeenCalledWith(
      "redis auth lockout store unavailable",
      expect.objectContaining({
        fn: "recordFailedAttempt",
        message: "READONLY",
      }),
    );
  });

  it("uses Redis when lazy readiness succeeds", async () => {
    redisState.ensureReady.mockResolvedValueOnce(true);

    const { isRateLimited } = await import("@/lib/loginLockout.js");

    await expect(isRateLimited("user@example.com")).resolves.toBe(false);
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(redisState.mget).toHaveBeenCalledWith(
      "ratelimit:attempts:user@example.com",
      "ratelimit:window:user@example.com",
    );
  });
});
