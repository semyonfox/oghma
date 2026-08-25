import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  s3Send: vi.fn(),
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/oghmanotes-vault.zip"),
  getStorageProvider: vi.fn(),
  buildExportPathMap: vi.fn().mockResolvedValue(new Map()),
  sendVaultExportCompleteEmail: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/storage/init.ts", () => ({
  getStorageProvider: mocks.getStorageProvider,
}));
vi.mock("@/lib/storage/s3.ts", () => ({
  createS3ClientFromEnv: () => ({ send: mocks.s3Send }),
}));
vi.mock("@/lib/vault/tree-builder", () => ({
  buildExportPathMap: mocks.buildExportPathMap,
}));
vi.mock("@/lib/email", () => ({
  sendVaultExportCompleteEmail: mocks.sendVaultExportCompleteEmail,
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }

  return {
    CreateMultipartUploadCommand: class extends Command {},
    UploadPartCommand: class extends Command {},
    CompleteMultipartUploadCommand: class extends Command {},
    AbortMultipartUploadCommand: class extends Command {},
    GetObjectCommand: class extends Command {},
  };
});

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { processVaultExport } from "@/lib/vault/export-worker";

describe("processVaultExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORAGE_BUCKET = "test";
    process.env.STORAGE_PREFIX = "oghma";

    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "job-1" }])
      .mockResolvedValueOnce([]);
    mocks.s3Send
      .mockResolvedValueOnce({ UploadId: "upload-1" })
      .mockResolvedValueOnce({ ETag: "etag-1" })
      .mockResolvedValueOnce({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs the initial download URL with the displayed filename", async () => {
    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    const command = mocks.getSignedUrl.mock.calls[0][1] as InstanceType<
      typeof GetObjectCommand
    >;
    expect(command.input).toMatchObject({
      Bucket: "test",
      Key: "oghma/exports/user-1/job-1/vault-export.zip",
      ResponseContentDisposition: 'attachment; filename="oghmanotes-vault.zip"',
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 86400 },
    );
  });

  it("fails the job rather than publishing an archive with unreadable files", async () => {
    mocks.buildExportPathMap.mockResolvedValueOnce(
      new Map([
        [
          "note-1",
          {
            path: "Lecture 1.pdf",
            s3Key: "files/lecture-1.pdf",
            content: null,
          },
        ],
      ]),
    );
    mocks.s3Send.mockReset();
    mocks.s3Send
      .mockResolvedValueOnce({ UploadId: "upload-1" })
      .mockRejectedValueOnce(new Error("object is unavailable"))
      .mockResolvedValueOnce({});

    await expect(
      processVaultExport({ jobId: "job-1", userId: "user-1" }),
    ).rejects.toThrow("Could not export 1 file: Lecture 1.pdf");

    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
    expect(mocks.sendVaultExportCompleteEmail).not.toHaveBeenCalled();
    expect(mocks.s3Send).toHaveBeenCalledTimes(3);
  });
});
