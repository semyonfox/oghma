import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so the mock object is available
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
const connection = vi.hoisted(() => ({ ready: true, ensureReady: vi.fn() }));

vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
  get redisReady() { return connection.ready; },
  ensureRedisReady: connection.ensureReady,
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";

beforeEach(() => {
  vi.clearAllMocks();
  connection.ready = true;
  connection.ensureReady.mockResolvedValue(true);
});

// --- cacheGet ---

describe("cacheGet", () => {
  it("returns parsed JSON on cache hit", async () => {
    const data = { notes: [1, 2, 3] };
    mockRedis.get.mockResolvedValue(JSON.stringify(data));

    const result = await cacheGet<typeof data>("test-key");
    expect(result).toEqual(data);
  });

  it("returns null on cache miss", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await cacheGet("missing-key");
    expect(result).toBeNull();
  });

  it("returns null when redis throws an error", async () => {
    mockRedis.get.mockRejectedValue(new Error("connection lost"));

    const result = await cacheGet("error-key");
    expect(result).toBeNull();
  });
});

// --- cacheSet ---

describe("cacheSet", () => {
  it("serializes and stores value with TTL", async () => {
    mockRedis.set.mockResolvedValue("OK");
    const data = { id: 1, name: "note" };

    await cacheSet("my-key", data, 300);
    expect(mockRedis.set).toHaveBeenCalledWith(
      "my-key",
      JSON.stringify(data),
      "EX",
      300,
    );
  });

  it("skips caching when value exceeds 100KB", async () => {
    // create a string larger than 100KB
    const largeValue = "x".repeat(101 * 1024);

    await cacheSet("big-key", largeValue, 60);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("does not throw when redis errors", async () => {
    mockRedis.set.mockRejectedValue(new Error("write failed"));

    await expect(cacheSet("key", "value", 60)).resolves.toBeUndefined();
  });
});

// --- cacheInvalidate ---

describe("cacheInvalidate", () => {
  it("connects before invalidating on the first request after a cold start", async () => {
    connection.ready = false;
    mockRedis.del.mockResolvedValue(1);

    await cacheInvalidate("cached-tree");

    expect(mockRedis.del).toHaveBeenCalledWith("cached-tree");
  });

  it("keeps mutations available when Redis cannot connect", async () => {
    connection.ready = false;
    connection.ensureReady.mockResolvedValue(false);

    await expect(cacheInvalidate("cached-tree")).resolves.toBeUndefined();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("deletes multiple keys", async () => {
    mockRedis.del.mockResolvedValue(1);

    await cacheInvalidate("key1", "key2", "key3");
    expect(mockRedis.del.mock.calls.flat().sort()).toEqual(["key1", "key2", "key3"]);
  });

  it("does not throw when redis errors", async () => {
    mockRedis.del.mockRejectedValue(new Error("del failed"));

    await expect(cacheInvalidate("key")).resolves.toBeUndefined();
  });
});

// --- cacheKeys builders ---

describe("cacheKeys", () => {
  it("settings keeps UUID-like user IDs unchanged", () => {
    expect(cacheKeys.settings("11111111-1111-4111-8111-111111111111")).toBe(
      "cache:{11111111-1111-4111-8111-111111111111}:settings",
    );
  });
});
