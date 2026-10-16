import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import type { ExportEntry } from "@/lib/vault/tree-builder";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { begin: vi.fn() }),
  s3Send: vi.fn(),
  signVaultExportDownload: vi.fn().mockResolvedValue("https://signed.example/oghmanotes-vault.zip"),
  getObjectStream: vi.fn(),
  buildExportPathMap: vi.fn(),
  sendVaultExportCompleteEmail: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
// prefixes like the real provider, so a test reading "oghma/..." proves the
// worker passes bare keys and lets the provider apply the prefix once
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({ getObjectStream: mocks.getObjectStream }),
}));
vi.mock("@/lib/storage/s3.ts", () => ({
  createS3ClientFromEnv: () => ({ send: mocks.s3Send }),
}));
vi.mock("@/lib/vault/artifacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vault/artifacts")>()),
  signVaultExportDownload: mocks.signVaultExportDownload,
  vaultStorageLocation: (path: string) => ({ bucket: "test", key: `oghma/${path}` }),
}));
vi.mock("@/lib/vault/tree-builder", () => ({
  buildExportPathMap: mocks.buildExportPathMap,
}));
vi.mock("@/lib/email", () => ({
  sendVaultExportCompleteEmail: mocks.sendVaultExportCompleteEmail,
}));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  const tagged = (kind: string) => class extends Command { kind = kind; };
  return {
    CreateMultipartUploadCommand: tagged("create"),
    UploadPartCommand: tagged("part"),
    CompleteMultipartUploadCommand: tagged("complete"),
    AbortMultipartUploadCommand: tagged("abort"),
  };
});

import { processVaultExport } from "@/lib/vault/export-worker";

type Heartbeat = { cancel_requested_at: string | null } | null;

let objects: Map<string, Buffer[]>;
let parts: Buffer[];
let heartbeats: Heartbeat[];
let completionRow: { cancel_requested_at: string | null } | null;
let noteContent: Map<string, string>;

function queryText(call: unknown[]): string {
  const [strings] = call;
  return Array.isArray(strings) ? strings.join("?") : "";
}

function s3Calls(kind: string) {
  return mocks.s3Send.mock.calls.filter(([command]) => command.kind === kind);
}

function archive(): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(Buffer.concat(parts)));
}

function entries(list: ExportEntry[]) {
  mocks.buildExportPathMap.mockResolvedValueOnce(list);
}

describe("processVaultExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORAGE_BUCKET = "test";
    objects = new Map();
    parts = [];
    heartbeats = [];
    completionRow = { cancel_requested_at: null };
    noteContent = new Map();
    mocks.buildExportPathMap.mockResolvedValue([]);

    mocks.sql.begin.mockImplementation(
      async (cb: (tx: typeof mocks.sql) => Promise<unknown>) => cb(mocks.sql),
    );
    mocks.sql.mockImplementation(async (...call: unknown[]) => {
      const text = queryText(call);
      if (text.includes("SET status = 'processing'")) return [{ id: "job-1" }];
      if (text.includes("RETURNING cancel_requested_at")) {
        const next = heartbeats.length > 0 ? heartbeats.shift() : { cancel_requested_at: null };
        return next ? [next] : [];
      }
      if (text.includes("SELECT content FROM app.notes")) {
        const content = noteContent.get(String(call[1]));
        return content === undefined ? [] : [{ content }];
      }
      if (text.includes("SELECT j.cancel_requested_at")) return completionRow ? [completionRow] : [];
      if (text.includes("SELECT email FROM app.login")) return [{ email: "user@example.test" }];
      return [];
    });
    mocks.s3Send.mockImplementation(async (command: { kind: string; input: Record<string, unknown> }) => {
      switch (command.kind) {
        case "create":
          return { UploadId: "upload-1" };
        case "part":
          parts.push(command.input.Body as Buffer);
          return { ETag: `etag-${parts.length}` };
        default:
          return {};
      }
    });
    mocks.getObjectStream.mockImplementation(async (key: string) => {
      const chunks = objects.get(`oghma/${key}`);
      if (!chunks) throw new Error("NoSuchKey");
      return { body: Readable.from(chunks) };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs the download URL with the displayed filename and the artifact lifetime", async () => {
    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    expect(mocks.signVaultExportDownload).toHaveBeenCalledWith(
      "exports/user-1/job-1/vault-export.zip",
      86400,
    );
    expect(s3Calls("create")[0]?.[0].input).toMatchObject({
      Bucket: "test",
      Key: "oghma/exports/user-1/job-1/vault-export.zip",
    });
    expect(mocks.sendVaultExportCompleteEmail).toHaveBeenCalledWith(
      "user@example.test",
      { downloadUrl: "https://signed.example/oghmanotes-vault.zip" },
    );
    // the bearer URL is emailed, never stored on the job row
    const completion = mocks.sql.mock.calls.find((call) => queryText(call).includes("SET status = 'complete'"));
    expect(queryText(completion ?? [])).not.toContain("download_url");
  });

  it("streams large objects across several parts and produces a valid archive", async () => {
    const original = randomBytes(12 * 1024 * 1024);
    objects.set("oghma/files/lecture.pdf", [
      original.subarray(0, 4 * 1024 * 1024),
      original.subarray(4 * 1024 * 1024, 8 * 1024 * 1024),
      original.subarray(8 * 1024 * 1024),
    ]);
    entries([{ path: "Course/lecture.pdf", source: { kind: "object", s3Key: "files/lecture.pdf" } }]);

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    // parts were flushed while the file was still being read, not after buffering all of it
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(Buffer.from(archive()["Course/lecture.pdf"]).equals(original)).toBe(true);
    expect(s3Calls("complete")).toHaveLength(1);
    // deflating 12MB of incompressible bytes is slow on shared CI hosts
  }, 30_000);

  it("exports the note body the editor shows, read per note rather than up front", async () => {
    noteContent.set("note-1", "# edited in the app");
    entries([{ path: "notes.md", source: { kind: "content", noteId: "note-1" } }]);

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    expect(strFromU8(archive()["notes.md"])).toBe("# edited in the app");
  });

  it("fails the job rather than publishing an archive with unreadable files", async () => {
    entries([
      { path: "Lecture 1.pdf", source: { kind: "object", s3Key: "files/missing.pdf" } },
      { path: "ok.md", source: { kind: "content", noteId: "note-1" } },
    ]);
    noteContent.set("note-1", "fine");

    await expect(
      processVaultExport({ jobId: "job-1", userId: "user-1" }),
    ).rejects.toThrow("Could not export 1 file: Lecture 1.pdf");

    expect(mocks.signVaultExportDownload).not.toHaveBeenCalled();
    expect(mocks.sendVaultExportCompleteEmail).not.toHaveBeenCalled();
    expect(s3Calls("complete")).toHaveLength(0);
    expect(s3Calls("abort")).toHaveLength(1);
    const failed = mocks.sql.mock.calls.find((call) => queryText(call).includes("SET status = 'failed'"));
    expect(failed).toContain("Could not export 1 file: Lecture 1.pdf");
  });

  it("hides internal error text from the user-visible job error", async () => {
    mocks.buildExportPathMap.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    await expect(processVaultExport({ jobId: "job-1", userId: "user-1" })).rejects.toThrow();

    const failed = mocks.sql.mock.calls.find((call) => queryText(call).includes("SET status = 'failed'"));
    expect(failed).toContain("Export failed. Please try again.");
    expect(failed?.join(" ")).not.toContain("10.0.0.5");
  });

  it("stops and records the cancel when the heartbeat sees a request", async () => {
    noteContent.set("a", "a");
    entries([
      { path: "a.md", source: { kind: "content", noteId: "a" } },
      { path: "b.md", source: { kind: "content", noteId: "b" } },
    ]);
    heartbeats = [{ cancel_requested_at: "2026-10-06T00:00:00Z" }];

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    expect(mocks.sql.mock.calls.some((call) => queryText(call).includes("SET status = 'cancelled'"))).toBe(true);
    expect(mocks.sql.mock.calls.filter((call) => queryText(call).includes("SELECT content"))).toHaveLength(1);
    expect(s3Calls("abort")).toHaveLength(1);
    expect(mocks.signVaultExportDownload).not.toHaveBeenCalled();
  });

  it("stops quietly when Clear Vault deleted the job row mid-export", async () => {
    noteContent.set("a", "a");
    entries([
      { path: "a.md", source: { kind: "content", noteId: "a" } },
      { path: "b.md", source: { kind: "content", noteId: "b" } },
    ]);
    heartbeats = [null];

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    expect(mocks.sql.mock.calls.filter((call) => queryText(call).includes("SELECT content"))).toHaveLength(1);
    expect(s3Calls("abort")).toHaveLength(1);
    expect(mocks.sql.mock.calls.some((call) => queryText(call).includes("SET status = 'cancelled'"))).toBe(false);
  });

  it("finishes a cancel that lands after the last file instead of leaving the job processing", async () => {
    completionRow = { cancel_requested_at: "2026-10-06T00:00:00Z" };

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    expect(mocks.sql.mock.calls.some((call) => queryText(call).includes("SET status = 'cancelled'"))).toBe(true);
    expect(s3Calls("complete")).toHaveLength(0);
    expect(s3Calls("abort")).toHaveLength(1);
    expect(mocks.signVaultExportDownload).not.toHaveBeenCalled();
  });

  // compresses ~20 MB, which outruns the 5s default when the machine is busy
  it("uploads equal-sized parts with only the last one shorter, as R2 requires", { timeout: 30_000 }, async () => {
    // base64 of random bytes barely compresses, so the archive spans several parts
    noteContent.set("note-1", randomBytes(15 * 1024 * 1024).toString("base64"));
    entries([{ path: "big.txt", source: { kind: "content", noteId: "note-1" } }]);

    await processVaultExport({ jobId: "job-1", userId: "user-1" });

    const sizes = parts.map((part) => part.length);
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sizes.slice(0, -1))).toEqual(new Set([8 * 1024 * 1024]));
    expect(sizes.at(-1)).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});
