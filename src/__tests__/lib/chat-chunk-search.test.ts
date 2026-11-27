import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/rag/embeddings", () => ({
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
import { embedText } from "@/lib/rag/embeddings";
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

    expect(embedText).not.toHaveBeenCalled();
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

  it.each(["semantic", "exact", "both"] as const)(
    "does not search outside an explicitly empty scope in %s mode",
    async (mode) => {
      vi.mocked(sql).mockResolvedValue([
        {
          note_id: "11111111-1111-1111-1111-111111111111",
          title: "Outside scope",
          chunk_id: "22222222-2222-2222-2222-222222222222",
          chunk_text: "Unrelated content",
        },
      ]);

      await expect(
        searchChatChunks({
          userId: "33333333-3333-3333-3333-333333333333",
          query: "content",
          mode,
          scopedNoteIds: [],
        }),
      ).resolves.toEqual([]);
      expect(embedText).not.toHaveBeenCalled();
      expect(searchChunkVectors).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    },
  );

  it.each(["semantic", "exact", "both"] as const)(
    "keeps global and nonempty scopes distinct in %s mode",
    async (mode) => {
      const noteIds = ["44444444-4444-4444-4444-444444444444"];
      for (const scopedNoteIds of [null, noteIds]) {
        vi.clearAllMocks();
        vi.mocked(sql).mockResolvedValue([]);
        vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
        vi.mocked(searchChunkVectors).mockResolvedValue([]);

        await searchChatChunks({
          userId: "33333333-3333-3333-3333-333333333333",
          query: "content",
          mode,
          scopedNoteIds,
        });

        if (mode === "semantic" || mode === "both") {
          expect(searchChunkVectors).toHaveBeenCalledWith(
            expect.objectContaining({ documentIds: scopedNoteIds }),
          );
        } else {
          expect(searchChunkVectors).not.toHaveBeenCalled();
        }
        if (mode === "exact" || mode === "both") {
          expect(sql).toHaveBeenCalledTimes(2);
          for (const call of vi.mocked(sql).mock.calls) {
            expect(call.includes(noteIds)).toBe(scopedNoteIds !== null);
          }
        } else {
          expect(sql).not.toHaveBeenCalled();
        }
      }
    },
  );

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

  it("returns no semantic hits the owner does not have", async () => {
    vi.mocked(searchChunkVectors).mockResolvedValue([
      {
        chunkId: "foreign-chunk",
        documentId: "foreign-note",
        userId: "other-user",
        score: 0.99,
        distance: 0.01,
      },
    ]);
    vi.mocked(sql).mockResolvedValue([]);

    await expect(
      searchChatChunks({
        userId: "user-1",
        query: "secret",
        mode: "semantic",
      }),
    ).resolves.toEqual([]);

    const [query, ...values] = vi.mocked(sql).mock.calls[0];
    const text = Array.from(query as TemplateStringsArray).join("");
    expect(text).toContain("c.user_id");
    expect(text).toContain("n.user_id");
    expect(text).toContain("deleted_at IS NULL");
    expect(values.filter((value) => value === "user-1")).toHaveLength(2);
  });

  it("keeps exact matches when the embedding provider fails", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("provider down"));
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          note_id: "11111111-1111-1111-1111-111111111111",
          title: null,
          chunk_id: "22222222-2222-2222-2222-222222222222",
          chunk_text: "Graphs   and\ttrees",
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      searchChatChunks({
        userId: "33333333-3333-3333-3333-333333333333",
        query: "graphs",
        mode: "both",
      }),
    ).resolves.toEqual([
      {
        noteId: "11111111-1111-1111-1111-111111111111",
        title: "Untitled",
        chunkId: "22222222-2222-2222-2222-222222222222",
        text: "Graphs and trees",
        source: "exact",
      },
    ]);
  });

  it("treats percent and underscore in the query as literal text", async () => {
    await searchChatChunks({
      userId: "22222222-2222-2222-2222-222222222222",
      query: "100%_done",
      mode: "exact",
    });

    const bound = vi.mocked(sql).mock.calls.flatMap((call) => call.slice(1));
    expect(bound).toContain("%100\\%\\_done%");
  });

  it("returns at most twelve matches, in retrieval order", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, index) => ({
          note_id: `note-${index}`,
          title: `Note ${index}`,
          chunk_id: `chunk-${index}`,
          chunk_text: `match ${index}`,
        })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 4 }, (_, index) => ({
          note_id: `fallback-${index}`,
          title: `Fallback ${index}`,
          snippet: `note match ${index}`,
        })),
      );

    const results = await searchChatChunks({
      userId: "user-1",
      query: "match",
      mode: "exact",
    });

    expect(results).toHaveLength(12);
    expect(results.slice(0, 10).map((result) => result.chunkId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `chunk-${index}`),
    );
    expect(results.slice(10).map((result) => result.chunkId)).toEqual([
      "note:fallback-0",
      "note:fallback-1",
    ]);
  });

  it("keeps one hit when semantic and exact search find the same chunk", async () => {
    vi.mocked(searchChunkVectors).mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "note-1",
        userId: "user-1",
        score: 0.9,
        distance: 0.1,
      },
    ]);
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          chunk_id: "chunk-1",
          note_id: "note-1",
          title: "Graphs",
          chunk_text: "Alpha",
          canvas_course_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          title: "Graphs",
          chunk_id: "chunk-1",
          chunk_text: "Alpha again",
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      searchChatChunks({
        userId: "user-1",
        query: "alpha",
        mode: "both",
      }),
    ).resolves.toEqual([
      {
        noteId: "note-1",
        title: "Graphs",
        chunkId: "chunk-1",
        text: "Alpha",
        source: "semantic",
      },
    ]);
  });
});
