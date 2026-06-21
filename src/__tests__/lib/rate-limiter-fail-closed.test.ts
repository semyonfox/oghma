import { beforeEach, describe, expect, it, vi } from "vitest";

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
  redisReady: true,
  redis: {
    pipeline: () => {
      throw new Error("redis unavailable");
    },
  },
}));

describe("checkRateLimit fail-closed categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
