import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/embedText", () => ({
  embedText: vi.fn(),
}));

vi.mock("@/lib/qdrant", () => ({
  searchChunkVectors: vi.fn(),
}));

vi.mock("@/lib/ai-config", () => ({
  getChatMaxDistance: vi.fn(() => 0.55),
}));

vi.mock("@/lib/metrics", () => ({
  Metrics: { searchLatency: vi.fn() },
}));

import sql from "@/database/pgsql";
import { embedText } from "@/lib/embedText";
import { searchChunkVectors } from "@/lib/qdrant";
import { searchChatChunks } from "@/lib/chat/chunk-search";

describe("searchChatChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockResolvedValue([]);
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(searchChunkVectors).mockResolvedValue([]);
  });

  it("falls back to note text when exact chunk search finds nothing", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "11111111-1111-1111-1111-111111111111",
          title: "Lecture 1",
          snippet: "The OSI model has seven layers.",
        },
      ]);

    const results = await searchChatChunks({
      userId: "22222222-2222-2222-2222-222222222222",
      query: "OSI model",
      mode: "exact",
      scopedNoteIds: ["11111111-1111-1111-1111-111111111111"],
    });

    expect(results).toEqual([
      {
        noteId: "11111111-1111-1111-1111-111111111111",
        title: "Lecture 1",
        chunkId: "note:11111111-1111-1111-1111-111111111111",
        text: "The OSI model has seven layers.",
        source: "exact-note",
      },
    ]);
  });

  it("applies folder scope to exact search and note fallback queries", async () => {
    const scopedNoteIds = ["33333333-3333-3333-3333-333333333333"];

    vi.mocked(sql)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: scopedNoteIds[0],
          title: "Lecture 2",
          snippet: "TCP/IP maps cleanly onto the lower OSI layers.",
        },
      ]);

    await searchChatChunks({
      userId: "44444444-4444-4444-4444-444444444444",
      query: "TCP/IP",
      mode: "exact",
      scopedNoteIds,
    });

    expect(vi.mocked(sql).mock.calls).toHaveLength(2);
    expect(vi.mocked(sql).mock.calls[0]).toContainEqual(scopedNoteIds);
    expect(vi.mocked(sql).mock.calls[1]).toContainEqual(scopedNoteIds);
  });

  it("does not require embeddings for exact-only search", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "55555555-5555-5555-5555-555555555555",
          title: "Lecture 3",
          snippet: "Switching works at layer 2.",
        },
      ]);

    const results = await searchChatChunks({
      userId: "66666666-6666-6666-6666-666666666666",
      query: "switching",
      mode: "exact",
    });

    expect(embedText).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("exact-note");
  });

  it("skips note fallback duplicates when exact chunk hits already exist", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          note_id: "77777777-7777-7777-7777-777777777777",
          title: "Lecture 4",
          chunk_id: "88888888-8888-8888-8888-888888888888",
          chunk_text: "Routers operate at layer 3.",
        },
      ])
      .mockResolvedValueOnce([
        {
          note_id: "77777777-7777-7777-7777-777777777777",
          title: "Lecture 4",
          snippet: "Routers operate at layer 3 and forward packets.",
        },
      ]);

    const results = await searchChatChunks({
      userId: "99999999-9999-9999-9999-999999999999",
      query: "routers",
      mode: "exact",
    });

    expect(results).toEqual([
      {
        noteId: "77777777-7777-7777-7777-777777777777",
        title: "Lecture 4",
        chunkId: "88888888-8888-8888-8888-888888888888",
        text: "Routers operate at layer 3.",
        source: "exact",
      },
    ]);
  });

  it("hydrates semantic hits in rank order, including context chunks from one note", async () => {
    vi.mocked(searchChunkVectors).mockResolvedValue([
      {
        chunkId: "chunk-a-best",
        documentId: "note-a",
        userId: "user-1",
        score: 0.9,
        distance: 0.1,
      },
      {
        chunkId: "chunk-a-second",
        documentId: "note-a",
        userId: "user-1",
        score: 0.8,
        distance: 0.2,
      },
      {
        chunkId: "chunk-b",
        documentId: "note-b",
        userId: "user-1",
        score: 0.7,
        distance: 0.3,
      },
    ]);
    vi.mocked(sql).mockResolvedValue([
      {
        note_id: "note-b",
        title: "B",
        chunk_id: "chunk-b",
        chunk_text: "Second note",
        canvas_course_id: null,
      },
      {
        note_id: "note-a",
        title: "A",
        chunk_id: "chunk-a-second",
        chunk_text: "Lower-ranked duplicate",
        canvas_course_id: null,
      },
      {
        note_id: "note-a",
        title: "A",
        chunk_id: "chunk-a-best",
        chunk_text: "Best note chunk",
        canvas_course_id: null,
      },
    ]);

    const results = await searchChatChunks({
      userId: "user-1",
      query: "search",
      mode: "semantic",
    });

    expect(results).toEqual([
      {
        noteId: "note-a",
        title: "A",
        chunkId: "chunk-a-best",
        text: "Best note chunk",
        source: "semantic",
      },
      {
        noteId: "note-a",
        title: "A",
        chunkId: "chunk-a-second",
        text: "Lower-ranked duplicate",
        source: "semantic",
      },
      {
        noteId: "note-b",
        title: "B",
        chunkId: "chunk-b",
        text: "Second note",
        source: "semantic",
      },
    ]);
  });
});
