import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  ready: true,
  ensureReady: vi.fn(async () => true),
  pipeline: vi.fn(() => {
    throw new Error("redis unavailable");
  }),
  zrange: vi.fn(),
  zrangebyscore: vi.fn(),
  zrem: vi.fn(),
}));

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const rateLimitViolation = vi.fn();

vi.mock("@/lib/logger", () => ({ default: logger }));
vi.mock("@/lib/metrics", () => ({
  Metrics: { rateLimitViolation },
}));
vi.mock("@/database/pgsql.js", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  get redisReady() {
    return redisState.ready;
  },
  ensureRedisReady: redisState.ensureReady,
  redis: {
    pipeline: redisState.pipeline,
    zrange: redisState.zrange,
    zrangebyscore: redisState.zrangebyscore,
    zrem: redisState.zrem,
  },
}));

describe("checkRateLimit fail-closed categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    redisState.ready = true;
    redisState.ensureReady.mockImplementation(async () => redisState.ready);
    redisState.pipeline.mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    redisState.zrange.mockResolvedValue([]);
    redisState.zrangebyscore.mockResolvedValue([]);
    redisState.zrem.mockResolvedValue(0);
  });

  it("returns 503 instead of in-memory fallback for auth-sensitive categories", async () => {
    const { checkRateLimit } = await import("@/lib/rateLimiter");

    const response = await checkRateLimit("password-reset", "user@example.com");

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("30");
    await expect(response?.json()).resolves.toEqual({
      error: "Service temporarily unavailable. Please try again shortly.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "redis rate limit failed for fail-closed category",
      expect.objectContaining({
        category: "password-reset",
        error: "redis unavailable",
        publicStatus: 503,
        retryAfterSeconds: 30,
      }),
    );
    expect(rateLimitViolation).toHaveBeenCalledWith(
      "password-reset:store-unavailable",
    );
  });

  it("returns 503 for fail-closed categories when redis is not ready", async () => {
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    const { checkRateLimit } = await import("@/lib/rateLimiter");

    const verifyResponse = await checkRateLimit("verify-email", "127.0.0.1");
    const resendResponse = await checkRateLimit(
      "resend-verification",
      "user@example.com",
    );

    expect(verifyResponse).not.toBeNull();
    expect(verifyResponse?.status).toBe(503);
    expect(resendResponse).not.toBeNull();
    expect(resendResponse?.status).toBe(503);
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(redisState.pipeline).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "redis rate limit failed for fail-closed category",
      expect.objectContaining({
        category: "verify-email",
        error: "redis not ready after initialization",
      }),
    );
    expect(rateLimitViolation).toHaveBeenCalledWith(
      "verify-email:store-unavailable",
    );
    expect(rateLimitViolation).toHaveBeenCalledWith(
      "resend-verification:store-unavailable",
    );
  });

  it("returns 503 when a Redis pipeline command returns an error tuple", async () => {
    const pipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [new Error("READONLY"), null],
        [null, 0],
        [null, 1],
        [null, 1],
      ]),
    };
    redisState.pipeline.mockReturnValue(pipeline as never);
    const { checkRateLimit } = await import("@/lib/rateLimiter");

    const response = await checkRateLimit("password-reset", "user@example.com");

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      "redis rate limit failed for fail-closed category",
      expect.objectContaining({
        category: "password-reset",
        error: "READONLY",
      }),
    );
    expect(rateLimitViolation).toHaveBeenCalledWith(
      "password-reset:store-unavailable",
    );
  });

  it("waits for lazy redis initialization before fail-closing", async () => {
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValueOnce(true);
    const pipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ]),
    };
    redisState.pipeline.mockReturnValue(pipeline as never);

    const { checkRateLimit } = await import("@/lib/rateLimiter");

    const response = await checkRateLimit("verify-email", "127.0.0.1");

    expect(response).toBeNull();
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(redisState.pipeline).toHaveBeenCalled();
  });
});
