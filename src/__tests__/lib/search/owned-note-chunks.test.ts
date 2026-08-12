import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));

import sql from "@/database/pgsql";
import { hydrateOwnedNoteChunks } from "@/lib/search/owned-note-chunks";

describe("hydrateOwnedNoteChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the first available chunk per note in vector-hit order", async () => {
    const hits = [
      { chunkId: "deleted-note", distance: 0.01 },
      { chunkId: "foreign-note", distance: 0.02 },
      { chunkId: "note-a-second", distance: 0.03 },
      { chunkId: "note-b", distance: 0.04 },
      { chunkId: "note-a-first", distance: 0.05 },
    ];
    vi.mocked(sql).mockResolvedValue([
      {
        chunk_id: "note-a-first",
        note_id: "note-a",
        title: "A first",
        chunk_text: "Later-ranked A chunk",
        canvas_course_id: null,
      },
      {
        chunk_id: "note-a-second",
        note_id: "note-a",
        title: "A second",
        chunk_text: "Best-ranked A chunk",
        canvas_course_id: "42",
      },
      {
        chunk_id: "note-b",
        note_id: "note-b",
        title: null,
        chunk_text: "B chunk",
        canvas_course_id: 43,
      },
    ]);

    const results = await hydrateOwnedNoteChunks("user-1", hits, {
      uniqueNotes: true,
    });

    expect(results).toEqual([
      {
        hit: hits[2],
        chunkId: "note-a-second",
        noteId: "note-a",
        title: "A second",
        text: "Best-ranked A chunk",
        canvasCourseId: "42",
      },
      {
        hit: hits[3],
        chunkId: "note-b",
        noteId: "note-b",
        title: null,
        text: "B chunk",
        canvasCourseId: "43",
      },
    ]);
  });

  it("keeps distinct chunks from the same note for context consumers", async () => {
    const hits = [
      { chunkId: "note-a-first", distance: 0.01 },
      { chunkId: "note-a-second", distance: 0.02 },
    ];
    vi.mocked(sql).mockResolvedValue([
      {
        chunk_id: "note-a-first",
        note_id: "note-a",
        title: "A",
        chunk_text: "First context chunk",
        canvas_course_id: null,
      },
      {
        chunk_id: "note-a-second",
        note_id: "note-a",
        title: "A",
        chunk_text: "Second context chunk",
        canvas_course_id: null,
      },
    ]);

    const results = await hydrateOwnedNoteChunks("user-1", hits);

    expect(results.map((result) => result.chunkId)).toEqual([
      "note-a-first",
      "note-a-second",
    ]);
  });

  it("does not query Postgres when the vector search found nothing", async () => {
    await expect(hydrateOwnedNoteChunks("user-1", [])).resolves.toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});
