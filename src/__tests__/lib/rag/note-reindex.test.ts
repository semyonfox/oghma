import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("@/database/pgsql", () => ({ default: sqlMock }));
vi.mock("@/lib/rag/indexing", () => ({
  replaceNoteEmbeddings: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/queue", () => ({
  enqueueNoteReindexJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { enqueueNoteReindexJob } from "@/lib/queue";
import { processExtractedText } from "@/lib/canvas/text-processing";
import { reindexNote } from "@/lib/rag/note-reindex";

const CONTENT = "# Title\n\nSome body text worth indexing.";
const STAMP = "2026-10-10 14:00:00.123456+00";

function noteRow(overrides: Partial<{ extracted_text: string | null }> = {}) {
  return { content: CONTENT, extracted_text: null, updated_at: STAMP, ...overrides };
}

describe("reindexNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
  });

  it("reports a missing note without touching the index", async () => {
    await expect(reindexNote("note-1", "user-1")).resolves.toBe("missing");
    expect(replaceNoteEmbeddings).not.toHaveBeenCalled();
  });

  it("skips the embedding call when the index already matches the content", async () => {
    sqlMock.mockResolvedValueOnce([
      noteRow({ extracted_text: processExtractedText(CONTENT) }),
    ]);

    await expect(reindexNote("note-1", "user-1")).resolves.toBe("unchanged");
    expect(replaceNoteEmbeddings).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("embeds the current content and stamps the row it read", async () => {
    sqlMock
      .mockResolvedValueOnce([noteRow()])
      .mockResolvedValueOnce([{ note_id: "note-1" }]);

    await expect(reindexNote("note-1", "user-1")).resolves.toBe("indexed");
    expect(replaceNoteEmbeddings).toHaveBeenCalledTimes(1);
    expect(replaceNoteEmbeddings).toHaveBeenCalledWith(
      "note-1",
      "user-1",
      expect.arrayContaining([expect.stringContaining("Some body text")]),
    );
    // the UPDATE is fenced on the exact updated_at that was read
    expect(sqlMock.mock.calls[1].slice(1)).toContain(STAMP);
    expect(enqueueNoteReindexJob).not.toHaveBeenCalled();
  });

  it("requeues itself when the note changed while embeddings were built", async () => {
    sqlMock.mockResolvedValueOnce([noteRow()]).mockResolvedValueOnce([]);

    await expect(reindexNote("note-1", "user-1")).resolves.toBe("stale");
    expect(enqueueNoteReindexJob).toHaveBeenCalledWith("note-1", "user-1");
  });
});
