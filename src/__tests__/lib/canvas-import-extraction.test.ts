import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  (sqlMock as any).begin = vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  );
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

vi.mock("@/lib/canvas/import-scheduler.ts", () => ({
  dispatchFairCanvasFiles: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/canvas/extraction-retry.ts", () => ({
  enqueueExtractionRetry: vi.fn().mockResolvedValue({ delaySeconds: 30 }),
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
import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry.ts";
import {
  processDirectExtraction,
  processExtractionRetry,
  recoverPendingExtractionRetries,
  fetchResource,
  processCanvasFile,
  processMarkerComplete,
} from "@/lib/canvas/import-extraction.js";

describe("fetchResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an actual Canvas restriction without turning it into a failed request", async () => {
    await expect(
      fetchResource(
        async () => ({
          data: null,
          forbidden: true,
          error: "Access restricted by lecturer",
        }),
        "9007199254740993",
        "11111111-1111-4111-8111-111111111111",
        "Course",
        "files",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).resolves.toEqual({ data: null, forbidden: true });
  });

  it("fails a partial Canvas listing instead of silently importing its prefix", async () => {
    await expect(
      fetchResource(
        async () => ({
          data: [{ id: "1" }],
          forbidden: false,
          error: "Canvas API rate limited — try again later",
        }),
        "9007199254740993",
        "11111111-1111-4111-8111-111111111111",
        "Course",
        "files",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow("Canvas files request failed");
  });
});

describe("processDirectExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the original binary object buffer to PDF extraction", async () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00]);
    const getObjectAndMeta = vi.fn().mockResolvedValue({ buffer: pdfBuffer });

    vi.mocked(sql)
      .mockResolvedValueOnce([{ status: "pending" }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ parent_id: null }] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(getStorageProvider).mockReturnValue({ getObjectAndMeta } as never);
    vi.mocked(processRagPipeline).mockResolvedValue({
      noteId: "note-123",
      chunksStored: 2,
    } as never);

    await processDirectExtraction({
      noteId: "note-123",
      userId: "user-123",
      s3Key: "notes/note-123/lecture.pdf",
      filename: "lecture.pdf",
      mimeType: "application/pdf",
    });

    expect(getObjectAndMeta).toHaveBeenCalledWith(
      "notes/note-123/lecture.pdf",
    );
    expect(processRagPipeline).toHaveBeenCalledWith(
      "note-123",
      "user-123",
      null,
      pdfBuffer,
      expect.objectContaining({
        filename: "lecture.pdf",
        mimeType: "application/pdf",
      }),
      expect.any(Function),
    );

    const completionQuery = vi
      .mocked(sql)
      .mock.calls.map((call: any[]) => call[0]?.join(""))
      .find((query: string | undefined) => query?.includes("SET status = 'done'"));
    expect(completionQuery).toContain("chunks_stored");
  });
});

describe("processCanvasFile ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges a delayed message for a newer import generation without mutating it", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        job_id: "22222222-2222-4222-8222-222222222222",
        user_id: "33333333-3333-4333-8333-333333333333",
        status: "pending",
        canvas_token: "ciphertext",
        canvas_domain: "canvas.example",
      },
    ] as never);

    await expect(
      processCanvasFile({
        importRecordId: "11111111-1111-4111-8111-111111111111",
        jobId: "44444444-4444-4444-8444-444444444444",
        userId: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toBe(true);

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a duplicate delivery that loses the pending claim", async () => {
    const jobId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "11111111-1111-4111-8111-111111111111",
          job_id: jobId,
          user_id: userId,
          status: "pending",
          canvas_token: "ciphertext",
          canvas_domain: "canvas.example",
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    await expect(
      processCanvasFile({
        importRecordId: "11111111-1111-4111-8111-111111111111",
        jobId,
        userId,
      }),
    ).resolves.toBe(true);

    expect(vi.mocked(processRagPipeline)).not.toHaveBeenCalled();
  });
});

describe("processMarkerComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const markerJob = {
    callback_id: "11111111-1111-4111-8111-111111111111",
    note_id: "22222222-2222-4222-8222-222222222222",
    user_id: "33333333-3333-4333-8333-333333333333",
    canvas_job_id: null,
    parent_folder_id: null,
    filename: "lecture.pdf",
    mime_type: "application/pdf",
    result_key:
      "marker-results/11111111-1111-4111-8111-111111111111.json",
    completion_attempts: 1,
  };

  function markerResult(overrides: Record<string, unknown> = {}) {
    return Buffer.from(
      JSON.stringify({
        schema_version: 1,
        request_id: markerJob.callback_id,
        result_key: markerJob.result_key,
        success: true,
        format: "markdown",
        output: "# extracted",
        images: {},
        metadata: null,
        ...overrides,
      }),
    );
  }

  it("completes a database-bound result without trusting queue identity", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([markerJob] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ callback_id: markerJob.callback_id }] as never)
      .mockResolvedValueOnce([{ callback_id: markerJob.callback_id }] as never);
    vi.mocked(getStorageProvider).mockReturnValue({
      getObjectMeta: vi.fn().mockResolvedValue({ contentLength: 256 }),
      getObject: vi.fn().mockResolvedValue(markerResult()),
    } as never);
    vi.mocked(processRagPipeline).mockResolvedValue({
      noteId: "note-123",
      chunksStored: 3,
    } as never);

    await processMarkerComplete({ markerJobId: markerJob.callback_id });

    expect(processRagPipeline).toHaveBeenCalledWith(
      markerJob.note_id,
      markerJob.user_id,
      null,
      null,
      expect.objectContaining({
        filename: "lecture.pdf",
        mimeType: "application/pdf",
        retryOnFailure: false,
        extractionOverride: expect.objectContaining({
          source: "marker",
          rawText: "# extracted",
        }),
      }),
      expect.any(Function),
    );
    expect(
      vi
        .mocked(sql)
        .mock.calls.some((call: any[]) =>
          call[0]?.join("").includes("SET status = 'completed'"),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(sql)
        .mock.calls.some((call: any[]) =>
          call[0]
            ?.join("")
            .includes("SET status = 'complete', note_id = "),
        ),
    ).toBe(true);
  });

  it("records the applied page_range from a validated stored result", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([markerJob] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ callback_id: markerJob.callback_id }] as never)
      .mockResolvedValueOnce([{ callback_id: markerJob.callback_id }] as never);
    vi.mocked(getStorageProvider).mockReturnValue({
      getObjectMeta: vi.fn().mockResolvedValue({ contentLength: 256 }),
      getObject: vi
        .fn()
        .mockResolvedValue(markerResult({ output: "# preview", page_range: "0-2" })),
    } as never);
    vi.mocked(processRagPipeline).mockResolvedValue({
      noteId: "note-123",
      chunksStored: 1,
    } as never);

    await processMarkerComplete({ markerJobId: markerJob.callback_id });

    expect(processRagPipeline).toHaveBeenCalledWith(
      markerJob.note_id,
      markerJob.user_id,
      null,
      null,
      expect.objectContaining({
        extractionOverride: expect.objectContaining({
          source: "marker",
          pageRange: "0-2",
        }),
      }),
      expect.any(Function),
    );
  });

  it("rejects a mismatched result before any RAG write", async () => {
    vi.mocked(sql).mockResolvedValueOnce([markerJob] as never);
    vi.mocked(getStorageProvider).mockReturnValue({
      getObjectMeta: vi.fn().mockResolvedValue({ contentLength: 256 }),
      getObject: vi.fn().mockResolvedValue(markerResult({ request_id: "other" })),
    } as never);

    await processMarkerComplete({ markerJobId: markerJob.callback_id });

    expect(processRagPipeline).not.toHaveBeenCalled();
    expect((sql as any).begin).toHaveBeenCalled();
  });
});

describe("processExtractionRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks pending retry imports complete after successful indexing", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "import-123",
          status: "pending_retry",
          job_id: "job-123",
          imported_file_cache_id: null,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "import-123",
          job_id: "job-123",
          imported_file_cache_id: null,
        },
      ] as never)
      .mockResolvedValueOnce([{ id: "import-123" }] as never)
      .mockResolvedValueOnce([] as never)
      // The parent remains active while other files are still running.
      .mockResolvedValueOnce([{ count: "2" }] as never);

    vi.mocked(getStorageProvider).mockReturnValue({
      getObjectAndMeta: vi
        .fn()
        .mockResolvedValue({ buffer: Buffer.from("lecture notes") }),
    } as never);

    vi.mocked(processRagPipeline).mockResolvedValue({
      noteId: "note-123",
      chunksStored: 1,
    } as never);

    await processExtractionRetry({
      noteId: "note-123",
      userId: "user-123",
      s3Key: "canvas/user/file.txt",
      filename: "file.txt",
      mimeType: "text/plain",
      parentFolderId: null,
      attempt: 1,
      importRecordId: "import-123",
      jobId: "job-123",
    });

    const updateQueries: string[] = vi
      .mocked(sql)
      .mock.calls.map((call: any[]) => call[0]?.join(""))
      .filter((query: string | undefined) =>
        query?.includes("UPDATE app.canvas_imports"),
      );

    expect(updateQueries.some((query) => query.includes("status = 'complete'")))
      .toBe(true);
    expect(updateQueries.some((query) => query.includes("note_id ="))).toBe(
      true,
    );
  });

  it("does not re-index a completed Canvas retry after duplicate delivery", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "import-123",
          status: "complete",
          job_id: "job-123",
          imported_file_cache_id: null,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    await processExtractionRetry({
      noteId: "note-123",
      userId: "user-123",
      s3Key: "canvas/user/file.txt",
      filename: "file.txt",
      mimeType: "text/plain",
      parentFolderId: null,
      attempt: 1,
      importRecordId: "import-123",
      jobId: "job-123",
    });

    expect(processRagPipeline).not.toHaveBeenCalled();
    expect(getStorageProvider).not.toHaveBeenCalled();
  });

  it("re-enqueues a stale durable Canvas retry with its exact row generation", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        import_record_id: "import-123",
        note_id: "note-123",
        user_id: "user-123",
        job_id: "job-123",
        filename: "lecture.pdf",
        mime_type: "application/pdf",
        parent_folder_id: null,
        s3_key: "imports/shared/lecture.pdf",
      },
    ] as never);

    await expect(recoverPendingExtractionRetries()).resolves.toBe(1);

    expect(enqueueExtractionRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        importRecordId: "import-123",
        jobId: "job-123",
        noteId: "note-123",
      }),
    );
  });
});
