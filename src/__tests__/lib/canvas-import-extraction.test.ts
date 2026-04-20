import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  (sqlMock as any).begin = vi.fn();
  return { default: sqlMock };
});

vi.mock("@/lib/storage/init.ts", () => ({
  getStorageProvider: vi.fn(),
}));

vi.mock("@/lib/canvas/import-embedding.js", () => ({
  processRagPipeline: vi.fn(),
}));

vi.mock("@/lib/marker-output.ts", () => ({
  normalizeMarkerMarkdown: vi.fn((markdown: string) => markdown.trim()),
}));

vi.mock("@/lib/ocr.ts", () => ({
  splitMarkdownToChunks: vi.fn(() => ["chunk-1"]),
}));

vi.mock("@/lib/notes/storage/pg-tree.js", () => ({
  addNoteToTree: vi.fn(),
}));

vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(),
}));

vi.mock("@/lib/canvas/async-limiter.js", () => ({
  createAsyncLimiter: vi.fn(
    () => async (task: () => Promise<unknown>) => task(),
  ),
}));

vi.mock("@/lib/canvas/import-metrics.js", () => ({
  parseEnvConcurrency: vi.fn(() => 1),
}));

vi.mock("@/lib/crypto.ts", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@/lib/logger.ts", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import sql from "@/database/pgsql.js";
import { getStorageProvider } from "@/lib/storage/init";
import { processRagPipeline } from "@/lib/canvas/import-embedding.js";
import { processMarkerComplete } from "@/lib/canvas/import-extraction.js";

describe("processMarkerComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes direct-upload ingestion jobs without a canvas_imports row", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ status: "pending" }] as never)
      .mockResolvedValueOnce([] as never);

    vi.mocked(getStorageProvider).mockReturnValue({
      getObject: vi
        .fn()
        .mockResolvedValue(Buffer.from('{"output":"# extracted"}')),
    } as never);

    vi.mocked(processRagPipeline).mockResolvedValue({
      noteId: "note-123",
      chunksStored: 3,
    } as never);

    await processMarkerComplete({
      noteId: "note-123",
      userId: "user-123",
      resultKey: "marker-results/note-123.json",
      filename: "lecture.pdf",
      mimeType: "application/pdf",
      parentFolderId: null,
    });

    expect(processRagPipeline).toHaveBeenCalledWith(
      "note-123",
      "user-123",
      null,
      null,
      expect.objectContaining({
        filename: "lecture.pdf",
        mimeType: "application/pdf",
        extractionOverride: expect.objectContaining({
          source: "marker",
          rawText: "# extracted",
        }),
      }),
      expect.any(Function),
    );

    const updateQuery = vi
      .mocked(sql)
      .mock.calls.map((call: any[]) => call[0]?.join(""))
      .find((query: string | undefined) =>
        query?.includes("UPDATE app.ingestion_jobs"),
      );

    expect(updateQuery).toContain("SET status = 'done'");
    expect(updateQuery).toContain("chunks_stored");
    expect(
      vi
        .mocked(sql)
        .mock.calls.some((call: any[]) =>
          call[0]?.join("").includes("UPDATE app.canvas_imports"),
        ),
    ).toBe(false);
  });
});
