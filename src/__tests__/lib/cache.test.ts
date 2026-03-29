import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so the mock object is available
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
  redisReady: true,
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- cacheGet ---

describe("cacheGet", () => {
  it("returns parsed JSON on cache hit", async () => {
    const data = { notes: [1, 2, 3] };
    mockRedis.get.mockResolvedValue(JSON.stringify(data));

    const result = await cacheGet<typeof data>("test-key");
    expect(result).toEqual(data);
    expect(mockRedis.get).toHaveBeenCalledWith("test-key");
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

  it("handles different value types", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify("hello"));
    expect(await cacheGet<string>("str-key")).toBe("hello");

    mockRedis.get.mockResolvedValue(JSON.stringify(42));
    expect(await cacheGet<number>("num-key")).toBe(42);

    mockRedis.get.mockResolvedValue(JSON.stringify([1, 2]));
    expect(await cacheGet<number[]>("arr-key")).toEqual([1, 2]);
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
  it("deletes a single key", async () => {
    mockRedis.del.mockResolvedValue(1);

    await cacheInvalidate("key1");
    expect(mockRedis.del).toHaveBeenCalledWith("key1");
  });

  it("deletes multiple keys", async () => {
    mockRedis.del.mockResolvedValue(1);

    await cacheInvalidate("key1", "key2", "key3");
    expect(mockRedis.del).toHaveBeenCalledTimes(3);
    expect(mockRedis.del).toHaveBeenCalledWith("key1");
    expect(mockRedis.del).toHaveBeenCalledWith("key2");
    expect(mockRedis.del).toHaveBeenCalledWith("key3");
  });

  it("is a no-op when called with no keys", async () => {
    await cacheInvalidate();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("does not throw when redis errors", async () => {
    mockRedis.del.mockRejectedValue(new Error("del failed"));

    await expect(cacheInvalidate("key")).resolves.toBeUndefined();
  });
});

// --- cacheKeys builders ---

describe("cacheKeys", () => {
  it("treeChildren uses user hash tag and parent id", () => {
    expect(cacheKeys.treeChildren("u1", "p1")).toBe(
      "cache:{u1}:tree:children:p1",
    );
  });

  it('treeChildren uses "root" for null parent', () => {
    expect(cacheKeys.treeChildren("u1", null)).toBe(
      "cache:{u1}:tree:children:root",
    );
  });

  it("treeFull uses user hash tag", () => {
    expect(cacheKeys.treeFull("u1")).toBe("cache:{u1}:tree:full");
  });

  it("note includes userId and noteId", () => {
    expect(cacheKeys.note("u1", "n42")).toBe("cache:{u1}:note:n42");
  });

  it("notesList includes skip and limit", () => {
    expect(cacheKeys.notesList("u1", 0, 20)).toBe("cache:{u1}:notes:list:0:20");
  });

  it('notesList uses "all" when limit is undefined', () => {
    expect(cacheKeys.notesList("u1", 10, undefined)).toBe(
      "cache:{u1}:notes:list:10:all",
    );
  });

  it("settings uses userId", () => {
    expect(cacheKeys.settings("u1")).toBe("cache:{u1}:settings");
  });

  it("settings accepts numeric userId", () => {
    expect(cacheKeys.settings(123)).toBe("cache:{123}:settings");
  });
});
