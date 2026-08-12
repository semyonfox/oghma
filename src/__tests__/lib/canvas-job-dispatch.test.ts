import { describe, expect, it, vi } from "vitest";
import {
  dispatchCanvasJob,
  type CanvasJobHandlers,
} from "@/lib/canvas/job-dispatch";

function handlers(): CanvasJobHandlers {
  return {
    processDiscoverJob: vi.fn().mockResolvedValue(undefined),
    processCanvasFile: vi.fn().mockResolvedValue(undefined),
    processImportJob: vi.fn().mockResolvedValue(undefined),
    processDirectExtraction: vi.fn().mockResolvedValue(undefined),
    processExtractionRetry: vi.fn().mockResolvedValue(undefined),
    processMarkerComplete: vi.fn().mockResolvedValue(undefined),
    processMarkerFailed: vi.fn().mockResolvedValue(undefined),
    dispatchMarkerJob: vi.fn().mockResolvedValue(undefined),
    processVaultExport: vi.fn().mockResolvedValue(undefined),
    processVaultImport: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Canvas job dispatch", () => {
  it("maps a canvas file message and normalizes its attempt count", async () => {
    const target = handlers();

    await expect(
      dispatchCanvasJob(
        {
          name: "canvas-file",
          attemptsMade: 2,
          data: {
            importRecordId: "import-1",
            jobId: "job-1",
            userId: "user-1",
          },
        },
        target,
      ),
    ).resolves.toBe(true);

    expect(target.processCanvasFile).toHaveBeenCalledWith({
      importRecordId: "import-1",
      jobId: "job-1",
      userId: "user-1",
      attempt: 2,
    });
  });

  it("defaults invalid provider attempt counters to the first delivery", async () => {
    const target = handlers();

    await dispatchCanvasJob(
      {
        name: "canvas-discover",
        attemptsMade: -1,
        data: { jobId: "job-1" },
      },
      target,
    );

    expect(target.processDiscoverJob).toHaveBeenCalledWith("job-1", 0);
  });

  it("rejects malformed messages before invoking a handler", async () => {
    const target = handlers();

    await expect(
      dispatchCanvasJob(
        { name: "marker-dispatch", data: {} },
        target,
      ),
    ).rejects.toThrow("callbackId");
    expect(target.dispatchMarkerJob).not.toHaveBeenCalled();
  });

  it("validates direct extraction fields at the dispatch boundary", async () => {
    const target = handlers();

    await expect(
      dispatchCanvasJob(
        {
          name: "extract",
          data: { noteId: "note-1", userId: "user-1", mimeType: "text/plain" },
        },
        target,
      ),
    ).rejects.toThrow("s3Key");
    expect(target.processDirectExtraction).not.toHaveBeenCalled();
  });

  it("passes a validated extraction retry generation to its handler", async () => {
    const target = handlers();
    const data = {
      noteId: "note-1",
      userId: "user-1",
      s3Key: "notes/note-1/file.pdf",
      filename: "file.pdf",
      mimeType: "application/pdf",
      parentFolderId: null,
      attempt: 2,
      importRecordId: "import-1",
      jobId: "job-1",
    };

    await expect(
      dispatchCanvasJob({ name: "extract-retry", data }, target),
    ).resolves.toBe(true);
    expect(target.processExtractionRetry).toHaveBeenCalledWith(data);
  });

  it("leaves unknown messages for the runtime warning policy", async () => {
    const target = handlers();

    await expect(
      dispatchCanvasJob({ name: "future-job", data: {} }, target),
    ).resolves.toBe(false);
  });

  it("does not require a payload for an unknown message type", async () => {
    await expect(
      dispatchCanvasJob({ name: "future-job" }, handlers()),
    ).resolves.toBe(false);
  });
});
