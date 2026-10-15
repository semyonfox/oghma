import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("shared redis client during an outage", () => {
  // nothing listens on loopback port 1, so every connect attempt is refused
  it("rejects a command instead of queueing it forever", async () => {
    vi.stubEnv("REDIS_HOST", "127.0.0.1");
    vi.stubEnv("REDIS_PORT", "1");
    vi.stubEnv("REDIS_TLS", "false");
    vi.resetModules();
    const { redis, ensureRedisReady } = await import("@/lib/redis");

    try {
      await expect(ensureRedisReady(200)).resolves.toBe(false);
      await expect(redis.get("presence:probe")).rejects.toThrow();
    } finally {
      redis.disconnect();
    }
  }, 10_000);
});
