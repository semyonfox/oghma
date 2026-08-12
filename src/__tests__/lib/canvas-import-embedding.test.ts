import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MarkerSubmissionCancelledError extends Error {}
  return {
    sql: vi.fn().mockResolvedValue([]),
    extractContentFromBuffer: vi.fn(),
    getStorageProvider: vi.fn(),
    persistMarkerAssetsForNote: vi.fn(),
    replaceNoteEmbeddings: vi.fn(),
    moveNoteToExtractionBundle: vi.fn(),
    markerQueueEnabled: vi.fn(),
    processAllPdfsWithMarker: vi.fn(),
    submitMarkerJob: vi.fn(),
    enqueueExtractionRetry: vi.fn(),
    MarkerSubmissionCancelledError,
  };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/strip-markdown", () => ({
  stripMarkdown: vi.fn((value: string) => value),
}));
vi.mock("@/lib/storage/init.ts", () => ({
  getStorageProvider: mocks.getStorageProvider,
}));
vi.mock("@/lib/notes/extraction-bundle.ts", () => ({
  moveNoteToExtractionBundle: mocks.moveNoteToExtractionBundle,
}));
vi.mock("@/lib/rag/indexing.ts", () => ({
  replaceNoteEmbeddings: mocks.replaceNoteEmbeddings,
}));
vi.mock("@/lib/canvas/extraction-retry.ts", () => ({
  enqueueExtractionRetry: mocks.enqueueExtractionRetry,
  MAX_EXTRACTION_RETRIES: 3,
}));
vi.mock("@/lib/ingestion/extraction-core.ts", () => ({
  extractContentFromBuffer: mocks.extractContentFromBuffer,
}));
vi.mock("@/lib/marker-output.ts", () => ({
  persistMarkerAssetsForNote: mocks.persistMarkerAssetsForNote,
}));
vi.mock("@/lib/canvas/async-limiter", () => ({
  createAsyncLimiter: vi.fn(
    () => async (task: () => Promise<unknown>) => task(),
  ),
}));
vi.mock("@/lib/canvas/import-metrics", () => ({
  parseEnvConcurrency: vi.fn(() => 1),
}));
vi.mock("@/lib/logger.ts", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/text-sanitize.ts", () => ({
  sanitizePostgresText: vi.fn((value: string) => value),
}));
vi.mock("@/lib/marker-serverless.ts", () => ({
  markerQueueEnabled: mocks.markerQueueEnabled,
  processAllPdfsWithMarker: mocks.processAllPdfsWithMarker,
  submitMarkerJob: mocks.submitMarkerJob,
  MarkerSubmissionCancelledError: mocks.MarkerSubmissionCancelledError,
}));

import { processRagPipeline } from "@/lib/canvas/import-embedding";

describe("processRagPipeline PDF bundles", () => {
  const findOrCreateNote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([{ note_id: "pdf-note" }]);
    mocks.moveNoteToExtractionBundle.mockResolvedValue("bundle-123");
    mocks.markerQueueEnabled.mockReturnValue(false);
    mocks.processAllPdfsWithMarker.mockReturnValue(false);
    mocks.extractContentFromBuffer.mockResolvedValue({
      rawText: "# Lecture notes",
      chunks: ["Lecture notes"],
      source: "marker",
      markerImages: {},
      markerMetadata: null,
      pageRange: null,
    });
    mocks.getStorageProvider.mockReturnValue({});
    mocks.persistMarkerAssetsForNote.mockResolvedValue({
      markdown: "# Lecture notes",
      imageCount: 0,
    });
    mocks.replaceNoteEmbeddings.mockResolvedValue(1);
    findOrCreateNote.mockResolvedValue({ noteId: "markdown-note", created: true });
  });

  it("moves an uploaded PDF into its named folder before writing Markdown", async () => {
    await expect(
      processRagPipeline(
        "pdf-note",
        "user-1",
        null,
        Buffer.from("%PDF"),
        {
          filename: "Lecture 03.pdf",
          mimeType: "application/pdf",
        },
        findOrCreateNote,
      ),
    ).resolves.toEqual({ noteId: "markdown-note", chunksStored: 1 });

    expect(mocks.moveNoteToExtractionBundle).toHaveBeenCalledWith(
      "user-1",
      "pdf-note",
      "Lecture 03.pdf",
    );
    expect(findOrCreateNote).toHaveBeenCalledWith(
      "user-1",
      "Lecture 03.md",
      "bundle-123",
      expect.objectContaining({ content: "# Lecture notes" }),
    );
  });

  it("records the bundle as the Marker completion parent", async () => {
    mocks.markerQueueEnabled.mockReturnValue(true);
    mocks.processAllPdfsWithMarker.mockReturnValue(true);
    mocks.submitMarkerJob.mockResolvedValue({
      markerJobId: "marker-123",
      provider: "runpod",
      resultKey: "marker-results/marker-123.json",
    });

    await expect(
      processRagPipeline(
        "pdf-note",
        "user-1",
        "module-1",
        Buffer.from("%PDF"),
        {
          filename: "Lecture 03.pdf",
          mimeType: "application/pdf",
          s3Key: "notes/pdf-note/Lecture-03.pdf",
        },
        findOrCreateNote,
      ),
    ).resolves.toEqual({
      noteId: "pdf-note",
      chunksStored: 0,
      pendingMarker: true,
    });

    expect(mocks.submitMarkerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "pdf-note",
        parentFolderId: "bundle-123",
      }),
    );
    expect(mocks.extractContentFromBuffer).not.toHaveBeenCalled();
  });
});
