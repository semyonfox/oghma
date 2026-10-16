import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllMeta: vi.fn(),
  deleteCacheEntry: vi.fn(),
}));

vi.mock("@/lib/notes/pdf-cache/store", () => ({
  getAllMeta: mocks.getAllMeta,
  deleteCacheEntry: mocks.deleteCacheEntry,
}));

import { MAX_BYTES, MAX_ENTRIES, runEviction } from "@/lib/notes/pdf-cache/evict";

const MB = 1024 * 1024;

describe("PDF cache eviction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteCacheEntry.mockResolvedValue(undefined);
  });

  it("drops the oldest downloads until the byte budget fits", async () => {
    mocks.getAllMeta.mockResolvedValue([
      { s3Key: "newest", size: 200 * MB, cachedAt: 3 },
      { s3Key: "oldest", size: 200 * MB, cachedAt: 1 },
      { s3Key: "middle", size: 200 * MB, cachedAt: 2 },
    ]);

    await runEviction();

    expect(MAX_BYTES).toBeLessThan(600 * MB);
    expect(mocks.deleteCacheEntry.mock.calls).toEqual([["oldest"]]);
  });

  it("caps the number of cached files", async () => {
    mocks.getAllMeta.mockResolvedValue(
      Array.from({ length: MAX_ENTRIES + 2 }, (_, index) => ({
        s3Key: `file-${index}`,
        size: 1,
        cachedAt: index,
      })),
    );

    await runEviction();

    expect(mocks.deleteCacheEntry.mock.calls).toEqual([["file-0"], ["file-1"]]);
  });

  it("shares one pass between overlapping calls", async () => {
    mocks.getAllMeta.mockResolvedValue([]);

    await Promise.all([runEviction(), runEviction()]);

    expect(mocks.getAllMeta).toHaveBeenCalledTimes(1);
  });
});
