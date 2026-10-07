import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (work: (transaction: typeof tx) => Promise<void>) =>
      work(tx),
    ),
  });
  return {
    sql,
    tx,
    markerQueueEnabled: vi.fn(),
    submitMarkerJob: vi.fn(),
    extractWithMarker: vi.fn(),
    assertVaultImportJobActive: vi.fn(),
    replaceNoteEmbeddings: vi.fn(),
  };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/marker/serverless", () => ({
  markerQueueEnabled: mocks.markerQueueEnabled,
  submitMarkerJob: mocks.submitMarkerJob,
}));
vi.mock("@/lib/marker/ocr", () => ({
  extractWithMarker: mocks.extractWithMarker,
}));
vi.mock("@/lib/vault/tree-builder", async (original) => ({
  ...(await original<typeof import("@/lib/vault/tree-builder")>()),
  assertVaultImportJobActive: mocks.assertVaultImportJobActive,
}));
vi.mock("@/lib/rag/indexing", () => ({
  replaceNoteEmbeddings: mocks.replaceNoteEmbeddings,
}));

import { processRagPipeline } from "@/lib/vault/import-worker";
import { VaultImportCancelledError } from "@/lib/vault/tree-builder";

const options = {
  filename: "lecture.pdf",
  mimeType: "application/pdf",
  jobId: "vault-job",
  s3Key: "vault/user/vault-job/lecture.pdf",
};

describe("vault serverless extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.mockReset();
    mocks.sql.mockResolvedValue([]);
    mocks.markerQueueEnabled.mockReturnValue(true);
    mocks.submitMarkerJob.mockResolvedValue({ markerJobId: "marker-job" });
    mocks.assertVaultImportJobActive.mockResolvedValue(undefined);
    mocks.replaceNoteEmbeddings.mockResolvedValue(1);
    mocks.tx.mockResolvedValue([]);
  });

  it("queues the saved PDF without passing its ZIP job as a Canvas job", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ note_id: "note" }]);
    await processRagPipeline(
      "note",
      "user",
      "folder",
      Buffer.from("pdf"),
      options,
    );
    expect(mocks.submitMarkerJob).toHaveBeenCalledWith({
      sourceKey: options.s3Key,
      sourceBytes: 3,
      noteId: "note",
      userId: "user",
      filename: "lecture.pdf",
      mimeType: "application/pdf",
      parentFolderId: "folder",
    });
    expect(mocks.extractWithMarker).not.toHaveBeenCalled();
    expect(mocks.replaceNoteEmbeddings).not.toHaveBeenCalled();
    expect(mocks.assertVaultImportJobActive).toHaveBeenCalledWith(
      mocks.tx,
      "user",
      "vault-job",
    );
  });

  it("keeps text extraction local even with serverless enabled", async () => {
    await processRagPipeline("note", "user", null, Buffer.from("hello"), {
      ...options,
      filename: "note.txt",
      mimeType: "text/plain",
    });
    expect(mocks.submitMarkerJob).not.toHaveBeenCalled();
    expect(mocks.extractWithMarker).not.toHaveBeenCalled();
    expect(mocks.replaceNoteEmbeddings).toHaveBeenCalledWith("note", "user", [
      "hello",
    ]);
  });

  it("does not queue a deleted source note", async () => {
    await expect(
      processRagPipeline("note", "user", null, Buffer.from("pdf"), options),
    ).rejects.toBeInstanceOf(VaultImportCancelledError);
    expect(mocks.submitMarkerJob).not.toHaveBeenCalled();
  });

  it("does not queue after the ZIP import is cancelled", async () => {
    mocks.assertVaultImportJobActive.mockRejectedValue(
      new VaultImportCancelledError(),
    );
    await expect(
      processRagPipeline("note", "user", null, Buffer.from("pdf"), options),
    ).rejects.toBeInstanceOf(VaultImportCancelledError);
    expect(mocks.submitMarkerJob).not.toHaveBeenCalled();
  });

  it("records an extraction failure when submission rejects", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ note_id: "note" }]);
    mocks.submitMarkerJob.mockRejectedValue(new Error("submission failed"));
    await expect(
      processRagPipeline("note", "user", null, Buffer.from("pdf"), options),
    ).rejects.toThrow("submission failed");
    const calls = mocks.sql.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(" "),
    );
    expect(calls.some((query) => query.includes("SET status = 'failed'"))).toBe(
      true,
    );
  });
});
