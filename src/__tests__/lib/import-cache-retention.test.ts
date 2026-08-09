import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  deleteObject: vi.fn(),
};

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sqlMock.mockResolvedValue([]);
  sqlMock.begin = vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  );
  return { default: sqlMock };
});

vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: vi.fn(),
}));

vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => storage,
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn() },
}));

import sql from "@/database/pgsql.js";
import { deleteChunkVectors } from "@/lib/qdrant";
import {
  parseImportedFileCacheRetentionDays,
  runImportedFileCacheRetention,
} from "@/lib/canvas/import-cache-retention";

const CACHE_ID = "10000000-0000-4000-8000-000000000001";
const SHA256 = "a".repeat(64);
const ORIGINAL_KEY = `imports/shared/${SHA256}.pdf`;
const ASSET_KEY = `imports/shared-assets/${CACHE_ID}/page-1.png`;

function configureSql(options: {
  abandonedProcessing?: boolean;
  liveAtPurge?: boolean;
  liveReferenceAnswers?: boolean[];
  otherCacheUsesOriginal?: boolean;
} = {}) {
  const queries: string[] = [];
  let liveReferenceCheck = 0;
  const sqlMock = sql as unknown as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sqlMock.mockReset();
  sqlMock.begin.mockClear();
  sqlMock.begin.mockImplementation(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  );
  sqlMock.mockImplementation((parts: TemplateStringsArray) => {
    const query = parts.join(" ");
    queries.push(query);

    if (query.includes("pg_advisory_xact_lock")) return Promise.resolve([]);
    if (query.includes("Cache processing abandoned before a reference was attached")) {
      return Promise.resolve(options.abandonedProcessing ? [{ id: CACHE_ID }] : []);
    }
    if (query.includes("SET orphaned_at = COALESCE")) return Promise.resolve([]);
    if (query.includes("SET orphaned_at = NULL") && query.includes("WHERE cache.status")) {
      return Promise.resolve([]);
    }
    if (query.includes("SELECT id, sha256, storage_key")) {
      return Promise.resolve([{ id: CACHE_ID, sha256: SHA256, storage_key: ORIGINAL_KEY }]);
    }
    if (query.includes("AS has_live_references")) {
      const hasLiveReferences =
        options.liveReferenceAnswers?.[liveReferenceCheck++] ??
        Boolean(options.liveAtPurge);
      return Promise.resolve([{ has_live_references: hasLiveReferences }]);
    }
    if (query.includes("FROM app.imported_file_cache_chunks")) {
      return Promise.resolve([{ id: "20000000-0000-4000-8000-000000000001" }]);
    }
    if (query.includes("FROM app.imported_file_cache_assets")) {
      return Promise.resolve([{ storage_key: ASSET_KEY }]);
    }
    if (query.includes("WHERE storage_key =")) {
      return Promise.resolve(
        options.otherCacheUsesOriginal
          ? [{ id: "30000000-0000-4000-8000-000000000001" }]
          : [],
      );
    }
    if (query.includes("DELETE FROM app.imported_file_cache")) {
      return Promise.resolve([{ id: CACHE_ID }]);
    }
    if (query.includes("SELECT id, sha256") && query.includes("purge_after <= NOW")) {
      return Promise.resolve([{ id: CACHE_ID, sha256: SHA256 }]);
    }
    return Promise.resolve([]);
  });
  return queries;
}

describe("imported-file cache retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.deleteObject.mockResolvedValue(undefined);
    vi.mocked(deleteChunkVectors).mockResolvedValue(undefined);
  });

  it("bounds the retention configuration without allowing a zero-day cache", () => {
    expect(parseImportedFileCacheRetentionDays(undefined)).toBe(7);
    expect(parseImportedFileCacheRetentionDays("0")).toBe(1);
    expect(parseImportedFileCacheRetentionDays("9999")).toBe(365);
  });

  it("turns an abandoned, unreferenced processing cache into a bounded retry record", async () => {
    const queries = configureSql({ abandonedProcessing: true });

    const result = await runImportedFileCacheRetention({ batchSize: 1 });

    expect(result.cachesMarkedFailed).toBe(1);
    expect(
      queries.some((query) => query.includes("processing_started_at < NOW()")),
    ).toBe(true);
  });

  it("purges canonical vectors, per-cache assets, and the final shared original", async () => {
    configureSql();

    const result = await runImportedFileCacheRetention({
      retentionDays: 7,
      batchSize: 1,
    });

    expect(result).toMatchObject({
      cachesPurged: 1,
      purgeFailures: 0,
      retentionDays: 7,
    });
    expect(deleteChunkVectors).toHaveBeenCalledWith([
      "20000000-0000-4000-8000-000000000001",
    ]);
    expect(storage.deleteObject).toHaveBeenCalledWith(ASSET_KEY);
    expect(storage.deleteObject).toHaveBeenCalledWith(ORIGINAL_KEY);
  });

  it("keeps a shared original until every pipeline-version cache row is gone", async () => {
    configureSql({ otherCacheUsesOriginal: true });

    await runImportedFileCacheRetention({ batchSize: 1 });

    expect(storage.deleteObject).toHaveBeenCalledWith(ASSET_KEY);
    expect(storage.deleteObject).not.toHaveBeenCalledWith(ORIGINAL_KEY);
  });

  it("clears the schedule instead of purging when a reference reappears", async () => {
    const queries = configureSql({ liveAtPurge: true });

    const result = await runImportedFileCacheRetention({ batchSize: 1 });

    expect(result).toMatchObject({ cachesRevived: 1, cachesPurged: 0 });
    expect(deleteChunkVectors).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes("SET orphaned_at = NULL"))).toBe(true);
  });

  it("checks again before external cleanup when a reference appears mid-scan", async () => {
    configureSql({ liveReferenceAnswers: [false, true] });

    const result = await runImportedFileCacheRetention({ batchSize: 1 });

    expect(result).toMatchObject({ cachesRevived: 1, cachesPurged: 0 });
    expect(deleteChunkVectors).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("keeps the cache row retryable when Qdrant deletion fails", async () => {
    const queries = configureSql();
    vi.mocked(deleteChunkVectors).mockRejectedValueOnce(new Error("Qdrant unavailable"));

    const result = await runImportedFileCacheRetention({ batchSize: 1 });

    expect(result).toMatchObject({ cachesPurged: 0, purgeFailures: 1 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(
      queries.some((query) => query.includes("DELETE FROM app.imported_file_cache")),
    ).toBe(false);
  });

  it("keeps the cache row retryable when object deletion fails", async () => {
    const queries = configureSql();
    storage.deleteObject.mockRejectedValueOnce(new Error("storage unavailable"));

    const result = await runImportedFileCacheRetention({ batchSize: 1 });

    expect(result).toMatchObject({ cachesPurged: 0, purgeFailures: 1 });
    expect(
      queries.some((query) => query.includes("DELETE FROM app.imported_file_cache")),
    ).toBe(false);
  });
});
