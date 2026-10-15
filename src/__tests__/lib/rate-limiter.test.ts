import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  ready: true,
  ensureReady: vi.fn(async () => true),
  multi: vi.fn(() => {
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
vi.mock("@/database/pgsql", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  get redisReady() {
    return redisState.ready;
  },
  ensureRedisReady: redisState.ensureReady,
  redis: {
    multi: redisState.multi,
    zrange: redisState.zrange,
    zrangebyscore: redisState.zrangebyscore,
    zrem: redisState.zrem,
  },
}));

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    redisState.ready = true;
    redisState.ensureReady.mockImplementation(async () => redisState.ready);
    redisState.multi.mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    redisState.zrange.mockResolvedValue([]);
    redisState.zrangebyscore.mockResolvedValue([]);
    redisState.zrem.mockResolvedValue(0);
  });

  it("returns 503 instead of in-memory fallback for auth-sensitive categories", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

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
    const { checkRateLimit } = await import("@/lib/rate-limiter");

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
    expect(redisState.multi).not.toHaveBeenCalled();
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

  it("returns 503 when a Redis transaction command returns an error tuple", async () => {
    const transaction = {
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
    redisState.multi.mockReturnValue(transaction as never);
    const { checkRateLimit } = await import("@/lib/rate-limiter");

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
    const transaction = {
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
    redisState.multi.mockReturnValue(transaction as never);

    const { checkRateLimit } = await import("@/lib/rate-limiter");

    const response = await checkRateLimit("verify-email", "127.0.0.1");

    expect(response).toBeNull();
    expect(redisState.ensureReady).toHaveBeenCalled();
    expect(redisState.multi).toHaveBeenCalled();
  });

  function transactionWithCount(count: number) {
    const transaction = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, count],
        [null, 1],
        [null, 1],
      ]),
    };
    redisState.multi.mockReturnValue(transaction as never);
    return transaction;
  }

  it("removes exactly its own entry when a request is over the limit", async () => {
    const transaction = transactionWithCount(3);
    const now = Date.now();
    redisState.zrange.mockResolvedValue(["older", String(now - 60_000)]);
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    const response = await checkRateLimit("password-reset", "user@example.com");

    expect(response?.status).toBe(429);
    const member = transaction.zadd.mock.calls[0]?.[2];
    expect(typeof member).toBe("string");
    expect(redisState.zrem).toHaveBeenCalledWith(
      "rl:{user@example.com}:password-reset",
      member,
    );
    // the oldest hit leaves the hour window in about 59 minutes
    const retryAfter = Number(response?.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(3500);
    expect(retryAfter).toBeLessThanOrEqual(3540);
    expect(redisState.zrangebyscore).not.toHaveBeenCalled();
  });

  it("allows a request under the limit without touching other entries", async () => {
    transactionWithCount(2);
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    await expect(
      checkRateLimit("password-reset", "user@example.com"),
    ).resolves.toBeNull();
    expect(redisState.zrem).not.toHaveBeenCalled();
  });

  it("still returns 429 when the audit log client throws synchronously", async () => {
    transactionWithCount(3);
    const { default: sql } = await import("@/database/pgsql");
    vi.mocked(sql).mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    const response = await checkRateLimit("password-reset", "user@example.com");

    expect(response?.status).toBe(429);
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        "rate limit audit log failed",
        expect.objectContaining({ category: "password-reset" }),
      ),
    );
  });

  it("fails the login cap closed unless the operator opted login into fail-open", async () => {
    redisState.ready = false;
    const closed = await import("@/lib/rate-limiter");
    expect((await closed.checkRateLimit("login", "203.0.113.7"))?.status).toBe(503);

    vi.resetModules();
    vi.stubEnv("AUTH_LOCKOUT_FAIL_OPEN", "true");
    try {
      const open = await import("@/lib/rate-limiter");
      await expect(open.checkRateLimit("login", "203.0.113.7")).resolves.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails open to the per-process window for non-security categories", async () => {
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    // share allows 10 an hour per user
    for (let i = 0; i < 10; i += 1) {
      await expect(checkRateLimit("share", "user-1")).resolves.toBeNull();
    }
    const limited = await checkRateLimit("share", "user-1");

    expect(limited?.status).toBe(429);
    expect(redisState.multi).not.toHaveBeenCalled();
    await expect(checkRateLimit("share", "user-2")).resolves.toBeNull();
  });
});
