import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn();
  return {
    sql,
    deleteChunkVectors: vi.fn().mockResolvedValue(undefined),
    getChunkVectors: vi.fn(),
    setChunkVectorsSearchable: vi.fn().mockResolvedValue(undefined),
    upsertChunkVectors: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: mocks.deleteChunkVectors,
  getChunkVectors: mocks.getChunkVectors,
  setChunkVectorsSearchable: mocks.setChunkVectorsSearchable,
  upsertChunkVectors: mocks.upsertChunkVectors,
}));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/lib/marker-output", () => ({
  markerAssetKey: vi.fn(),
  sanitizeMarkerAssetName: vi.fn(),
}));

import { cloneImportedPdfCacheToNote } from "@/lib/canvas/import-cache";

const params = {
  cacheId: "cache-1",
  noteId: "note-1",
  userId: "user-1",
};

function queryText(call: unknown[]): string {
  return Array.from(call[0] as TemplateStringsArray).join("");
}

describe("cloning an imported PDF cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockReset();
    mocks.sql.begin.mockReset();
  });

  it("does nothing when the owned note is missing or already trashed", async () => {
    const tx = vi.fn().mockResolvedValue([]);
    mocks.sql.begin.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    mocks.sql.mockResolvedValue([{
      extracted_markdown: "# Cached",
      extracted_text: "Cached",
      extraction_coverage: { source: "marker" },
    }]);

    await expect(cloneImportedPdfCacheToNote(params)).resolves.toBe(0);

    expect(tx).toHaveBeenCalledTimes(2);
    expect(queryText(tx.mock.calls[1])).toContain("deleted_at IS NULL");
    expect(mocks.getChunkVectors).not.toHaveBeenCalled();
    expect(mocks.upsertChunkVectors).not.toHaveBeenCalled();
  });

  it("updates note content and chunks in one transaction", async () => {
    const tx = vi.fn((parts: TemplateStringsArray) => {
      const query = Array.from(parts).join("");
      if (query.includes("SELECT content")) return Promise.resolve([{ content: "" }]);
      if (query.includes("FROM app.imported_file_cache_chunks")) {
        return Promise.resolve([{ id: "cached-chunk", text: "Cached", ordinal: 0 }]);
      }
      if (query.includes("SELECT id FROM app.chunks")) {
        return Promise.resolve([{ id: "old-chunk" }]);
      }
      if (query.includes("DELETE FROM app.chunks")) {
        return Promise.resolve([]);
      }
      if (query.includes("INSERT INTO app.chunks")) {
        return Promise.resolve([{ id: "new-chunk" }]);
      }
      return Promise.resolve([]);
    });
    mocks.sql.begin.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    mocks.sql
      .mockResolvedValueOnce([{
        extracted_markdown: "# Cached",
        extracted_text: "Cached",
        extraction_coverage: { source: "marker" },
      }])
      .mockResolvedValue([{ active: true }]);
    mocks.getChunkVectors.mockResolvedValue([
      { chunkId: "cached-chunk", vector: [0.25, 0.75] },
    ]);

    await expect(cloneImportedPdfCacheToNote(params)).resolves.toBe(1);

    const queries = tx.mock.calls.map(queryText);
    expect(queries.findIndex((query) => query.includes("DELETE FROM app.chunks")))
      .toBeLessThan(
        queries.findIndex((query) => query.includes("INSERT INTO app.chunks")),
      );
    expect(mocks.deleteChunkVectors).toHaveBeenCalledWith(["old-chunk"]);
    expect(mocks.upsertChunkVectors).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: "new-chunk",
        documentId: "note-1",
        userId: "user-1",
      }),
    ]);
  });

  it("removes a late vector when permanent deletion wins after commit", async () => {
    const tx = vi.fn((parts: TemplateStringsArray) => {
      const query = Array.from(parts).join("");
      if (query.includes("SELECT content")) return Promise.resolve([{ content: "" }]);
      if (query.includes("FROM app.imported_file_cache_chunks")) {
        return Promise.resolve([{ id: "cached-chunk", text: "Cached", ordinal: 0 }]);
      }
      if (query.includes("INSERT INTO app.chunks")) {
        return Promise.resolve([{ id: "new-chunk" }]);
      }
      return Promise.resolve([]);
    });
    mocks.sql.begin.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    mocks.sql
      .mockResolvedValueOnce([{ extracted_markdown: "# Cached" }])
      .mockResolvedValue([]);
    mocks.getChunkVectors.mockResolvedValue([
      { chunkId: "cached-chunk", vector: [1] },
    ]);

    await expect(cloneImportedPdfCacheToNote(params)).resolves.toBe(0);

    expect(mocks.deleteChunkVectors).toHaveBeenLastCalledWith(["new-chunk"]);
    expect(queryText(mocks.sql.mock.calls.at(-1) ?? [])).toContain(
      "id = ANY(",
    );
  });
});
