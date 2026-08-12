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

vi.mock("@/database/pgsql", () => ({
  default: sqlMock,
}));

vi.mock("@/lib/embeddings", () => ({
  embedChunks: vi.fn(),
}));

vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: vi.fn(),
  setChunkVectorsSearchable: vi.fn(),
  upsertChunkVectors: vi.fn(),
}));

import { embedChunks } from "@/lib/embeddings";
import {
  deleteChunkVectors,
  setChunkVectorsSearchable,
  upsertChunkVectors,
} from "@/lib/qdrant";
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
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("to_regclass")) return [{ table_name: null }];
      return [];
    });
    sqlMock.begin.mockReset();
    sqlMock.begin.mockImplementation(
      async (callback: (tx: ReturnType<typeof vi.fn>) => unknown) =>
        await callback(txMock),
    );
    vi.mocked(deleteChunkVectors).mockResolvedValue(undefined);
    vi.mocked(setChunkVectorsSearchable).mockResolvedValue(undefined);
    vi.mocked(upsertChunkVectors).mockResolvedValue(undefined);
  });

  it("stores chunk rows in Postgres and linked vectors in Qdrant", async () => {
    txMock
      .mockResolvedValueOnce([{ note_id: "note-1" }])
      .mockResolvedValueOnce([{ id: "old-chunk" }])
      .mockResolvedValueOnce([
        { id: "new-chunk-a" },
        { id: "new-chunk-b" },
      ]);
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
    expect(txMock).toHaveBeenCalledTimes(3);
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
    txMock
      .mockResolvedValueOnce([{ note_id: "note-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "new-chunk" }]);
    vi.mocked(embedChunks).mockResolvedValueOnce([
      { chunk: "alpha", vector: [0.1, 0.2] },
    ]);
    vi.mocked(upsertChunkVectors).mockRejectedValueOnce(
      new Error("qdrant unavailable"),
    );

    await expect(
      replaceNoteEmbeddings("note-1", "user-1", ["alpha"]),
    ).rejects.toThrow("qdrant unavailable");

    expect(deleteChunkVectors).toHaveBeenCalledWith(["new-chunk"]);
  });

  it("deletes old chunk vectors when there is no replacement content", async () => {
    txMock
      .mockResolvedValueOnce([{ note_id: "note-1" }])
      .mockResolvedValueOnce([{ id: "old-chunk" }]);

    const count = await replaceNoteEmbeddings("note-1", "user-1", [" "]);

    expect(count).toBe(0);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(deleteChunkVectors).toHaveBeenCalledWith(["old-chunk"]);
  });

  it("does not insert chunks when Trash has locked and hidden the note", async () => {
    txMock.mockResolvedValueOnce([]);
    vi.mocked(embedChunks).mockResolvedValueOnce([
      { chunk: "alpha", vector: [0.1, 0.2] },
    ]);

    await expect(
      replaceNoteEmbeddings("note-1", "user-1", ["alpha"]),
    ).resolves.toBe(0);

    const queries = txMock.mock.calls.map(([strings]) =>
      (strings as TemplateStringsArray).join(" "),
    );
    expect(queries[0]).toMatch(/deleted_at IS NULL[\s\S]*FOR UPDATE/);
    expect(queries.some((query) => query.includes("INSERT INTO app.chunks"))).toBe(
      false,
    );
    expect(upsertChunkVectors).not.toHaveBeenCalled();
  });
});
