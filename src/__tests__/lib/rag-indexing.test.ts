import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, txMock } = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn(async (callback: (tx: ReturnType<typeof vi.fn>) => unknown) => {
    return await callback(tx);
  });
  return { sqlMock: sql, txMock: tx };
});

vi.mock("@/database/pgsql.js", () => ({
  default: sqlMock,
}));

vi.mock("@/lib/embeddings", () => ({
  embedChunks: vi.fn(),
}));

vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: vi.fn(),
  upsertChunkVectors: vi.fn(),
}));

import { embedChunks } from "@/lib/embeddings";
import { deleteChunkVectors, upsertChunkVectors } from "@/lib/qdrant";
import {
  normalizeChunksForIndexing,
  replaceNoteEmbeddings,
} from "@/lib/rag/indexing";

describe("normalizeChunksForIndexing", () => {
  it("drops blank chunks and keeps first-seen order", () => {
    const out = normalizeChunksForIndexing([
      "",
      "  ",
      "alpha",
      "beta",
      "alpha",
      "\n\tbeta\n",
      "gamma",
    ]);

    expect(out).toEqual(["alpha", "beta", "gamma"]);
  });

  it("trims chunk text before dedupe", () => {
    const out = normalizeChunksForIndexing([
      "  heading one  ",
      "heading one",
      "heading two",
      "heading two   ",
    ]);

    expect(out).toEqual(["heading one", "heading two"]);
  });

  it("removes nul bytes before storing chunks", () => {
    const out = normalizeChunksForIndexing(["alpha\u0000 beta", "\u0000"]);

    expect(out).toEqual(["alpha beta"]);
  });
});

describe("replaceNoteEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockReset();
    txMock.mockReset();
    sqlMock.begin.mockClear();
    vi.mocked(deleteChunkVectors).mockResolvedValue(undefined);
    vi.mocked(upsertChunkVectors).mockResolvedValue(undefined);
  });

  it("stores chunk rows in Postgres and linked vectors in Qdrant", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "old-chunk" }]);
    txMock.mockResolvedValueOnce([{ id: "new-chunk-a" }, { id: "new-chunk-b" }]);
    vi.mocked(embedChunks).mockResolvedValueOnce([
      { chunk: "alpha", vector: [0.1, 0.2] },
      { chunk: "beta", vector: [0.3, 0.4] },
    ]);

    const count = await replaceNoteEmbeddings(
      "note-1",
      "user-1",
      ["alpha", "beta"],
    );

    expect(count).toBe(2);
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(upsertChunkVectors).toHaveBeenCalledWith([
      {
        chunkId: "new-chunk-a",
        documentId: "note-1",
        userId: "user-1",
        vector: [0.1, 0.2],
      },
      {
        chunkId: "new-chunk-b",
        documentId: "note-1",
        userId: "user-1",
        vector: [0.3, 0.4],
      },
    ]);
    expect(deleteChunkVectors).toHaveBeenCalledWith(["old-chunk"]);
  });

  it("removes newly inserted chunks if Qdrant upsert fails", async () => {
    sqlMock.mockResolvedValueOnce([]);
    txMock.mockResolvedValueOnce([{ id: "new-chunk" }]);
    vi.mocked(embedChunks).mockResolvedValueOnce([
      { chunk: "alpha", vector: [0.1, 0.2] },
    ]);
    vi.mocked(upsertChunkVectors).mockRejectedValueOnce(
      new Error("qdrant unavailable"),
    );

    await expect(
      replaceNoteEmbeddings("note-1", "user-1", ["alpha"]),
    ).rejects.toThrow("qdrant unavailable");

    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(deleteChunkVectors).not.toHaveBeenCalled();
  });

  it("deletes old chunk vectors when there is no replacement content", async () => {
    sqlMock.mockResolvedValueOnce([{ id: "old-chunk" }]);

    const count = await replaceNoteEmbeddings("note-1", "user-1", [" "]);

    expect(count).toBe(0);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(deleteChunkVectors).toHaveBeenCalledWith(["old-chunk"]);
  });
});
