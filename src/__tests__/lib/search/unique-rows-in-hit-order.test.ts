import { describe, expect, it } from "vitest";
import { uniqueRowsInHitOrder } from "@/lib/search/unique-rows-in-hit-order";

describe("uniqueRowsInHitOrder", () => {
  it("keeps the first available row for each note in hit order before limiting", () => {
    const hits = [
      { chunkId: "missing", distance: 0.01 },
      { chunkId: "note-a-second", distance: 0.02 },
      { chunkId: "note-b", distance: 0.03 },
      { chunkId: "note-a-first", distance: 0.04 },
      { chunkId: "note-c", distance: 0.05 },
    ];
    const rows = [
      { chunk_id: "note-a-first", note_id: "note-a", title: "A first" },
      { chunk_id: "note-a-second", note_id: "note-a", title: "A second" },
      { chunk_id: "note-b", note_id: "note-b", title: "B" },
      { chunk_id: "note-c", note_id: "note-c", title: "C" },
    ];

    const results = uniqueRowsInHitOrder(hits, rows, 2, (hit, row) => ({
      noteId: row.note_id,
      title: row.title,
      distance: hit.distance,
    }));

    expect(results).toEqual([
      { noteId: "note-a", title: "A second", distance: 0.02 },
      { noteId: "note-b", title: "B", distance: 0.03 },
    ]);
  });
});
