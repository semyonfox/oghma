import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { Zip, ZipDeflate, strToU8 } from "fflate";
import type { CreateNoteWithTreeInput } from "@/lib/notes/storage/create-note";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { begin: vi.fn() }),
  storage: {
    getObjectStream: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
    deletePrefix: vi.fn(),
  },
  insertNoteWithTree: vi.fn(),
  extractWithMarker: vi.fn(),
  sendVaultImportCompleteEmail: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/storage/init.ts", () => ({
  getStorageProvider: () => mocks.storage,
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree: mocks.insertNoteWithTree,
}));
vi.mock("@/lib/notes/extraction-bundle", () => ({
  moveNoteToExtractionBundle: vi.fn().mockResolvedValue("bundle-folder"),
}));
vi.mock("@/lib/marker/ocr.ts", () => ({ extractWithMarker: mocks.extractWithMarker }));
vi.mock("@/lib/marker/output.ts", () => ({
  markerAssetPrefix: vi.fn(),
  persistMarkerAssetsForNote: vi.fn(async ({ markdown }: { markdown: string }) => ({
    markdown,
    imageCount: 0,
  })),
}));
vi.mock("@/lib/rag/indexing.ts", () => ({ replaceNoteEmbeddings: vi.fn().mockResolvedValue(1) }));
vi.mock("@/lib/email", () => ({
  sendVaultImportCompleteEmail: mocks.sendVaultImportCompleteEmail,
}));

import { processVaultImport } from "@/lib/vault/import-worker";

const USER = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";

let heartbeats: Array<{ cancel_requested_at: string | null } | null>;

function queryText(call: unknown[]): string {
  const [strings] = call;
  return Array.isArray(strings) ? strings.join("?") : "";
}

function sqlCalls(fragment: string) {
  return mocks.sql.mock.calls.filter((call) => queryText(call).includes(fragment));
}

// fflate's streaming writer allows repeated names, which zipSync's object input cannot express
function buildZip(files: Array<[string, string]>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  for (const [name, body] of files) {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(body), true);
  }
  zip.end();
  return new Uint8Array(Buffer.concat(chunks));
}

function serveZip(bytes: Uint8Array) {
  mocks.storage.getObjectStream.mockResolvedValue({ body: Readable.from([Buffer.from(bytes)]) });
}

function run() {
  return processVaultImport({ jobId: JOB, userId: USER, s3Key: `vault-uploads/${USER}/u/vault.zip` });
}

function createdNotes(): CreateNoteWithTreeInput[] {
  return mocks.insertNoteWithTree.mock.calls.map(([, input]) => input as CreateNoteWithTreeInput);
}

describe("processVaultImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STORAGE_BUCKET = "test";
    heartbeats = [];
    mocks.sql.begin.mockImplementation(
      async (cb: (tx: typeof mocks.sql) => Promise<unknown>) => cb(mocks.sql),
    );
    mocks.sql.mockImplementation(async (...call: unknown[]) => {
      const text = queryText(call);
      if (text.includes("SET status = 'processing'")) return [{ id: JOB }];
      if (text.includes("FROM app.canvas_import_jobs") && text.includes("FOR KEY SHARE")) return [{ id: JOB }];
      if (text.includes("RETURNING cancel_requested_at")) {
        const next = heartbeats.length > 0 ? heartbeats.shift() : { cancel_requested_at: null };
        return next ? [next] : [];
      }
      if (text.includes("SELECT note_id") && text.includes("FROM app.notes")) return [{ note_id: "live" }];
      // a same-titled note already exists; reusing it would mean overwriting it
      if (text.includes("n.is_folder = false")) return [{ note_id: "existing-user-note" }];
      if (text.includes("SET status = 'complete'")) return [{ id: JOB }];
      return [];
    });
    mocks.storage.putObject.mockResolvedValue(undefined);
    mocks.storage.deleteObject.mockResolvedValue(undefined);
    mocks.insertNoteWithTree.mockImplementation(async (_tx, input: CreateNoteWithTreeInput) => input);
    mocks.extractWithMarker.mockResolvedValue({
      text: "# OCR output",
      chunks: ["OCR output"],
      images: {},
      metadata: null,
      pageRange: null,
    });
  });

  it("gives every entry its own object, even when the ZIP repeats a path", async () => {
    serveZip(buildZip([
      ["Week 1/notes.txt", "first"],
      ["Week 1/notes.txt", "second"],
    ]));

    await run();

    // the provider applies the storage prefix, so the worker passes the bare key
    expect(mocks.storage.getObjectStream).toHaveBeenCalledWith(`vault-uploads/${USER}/u/vault.zip`);
    const keys = mocks.storage.putObject.mock.calls.map(([key]) => String(key));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) {
      // the job prefix stays first so Clear Vault's prefix sweep still covers it
      expect(key.startsWith(`vault/${USER}/${JOB}/`)).toBe(true);
      expect(key.endsWith("/notes.txt")).toBe(true);
    }
  });

  it("creates a fresh companion instead of overwriting a same-named note with OCR text", async () => {
    serveZip(buildZip([
      ["Week 1/lecture.md", "my own notes"],
      ["Week 1/lecture.pptx", "pptx bytes"],
    ]));

    await run();

    const notes = createdNotes().filter((note) => note.title === "lecture.md");
    expect(notes).toHaveLength(2);
    const userNote = notes.find((note) => note.s3Key);
    const companion = notes.find((note) => !note.s3Key);
    expect(userNote?.content).toBe("my own notes");
    expect(companion?.content).toBe("# OCR output");

    const ocrWrites = sqlCalls("UPDATE app.notes").filter((call) => call.includes("# OCR output"));
    expect(ocrWrites.length).toBeGreaterThan(0);
    for (const call of ocrWrites) {
      expect(call).toContain(companion?.noteId);
      expect(call).not.toContain(userNote?.noteId);
      expect(call).not.toContain("existing-user-note");
    }
  });

  it("reports the real entry total only once the archive has been read", async () => {
    serveZip(buildZip([["a.md", "a"], ["b.md", "b"], ["__MACOSX/._a.md", "junk"]]));

    await run();

    const [complete] = sqlCalls("SET status = 'complete'");
    expect(complete).toContain(2);
    expect(sqlCalls("SET expected_total")).toHaveLength(0);
    expect(mocks.sendVaultImportCompleteEmail).not.toHaveBeenCalled();
  });

  it("records a cancel requested between files and never completes", async () => {
    serveZip(buildZip([["a.md", "a"], ["b.md", "b"]]));
    heartbeats = [{ cancel_requested_at: "2026-10-06T00:00:00Z" }];

    await run();

    expect(sqlCalls("SET status = 'cancelled'")).toHaveLength(1);
    expect(sqlCalls("SET status = 'complete'")).toHaveLength(0);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
  });

  it("shows archive problems to the user verbatim", async () => {
    serveZip(strToU8("definitely not a zip"));

    await expect(run()).rejects.toThrow("Uploaded object is not a ZIP file");

    const [failed] = sqlCalls("SET status = 'failed'");
    expect(failed).toContain("Uploaded object is not a ZIP file");
  });

  it("hides internal error text from the user-visible job error", async () => {
    mocks.storage.getObjectStream.mockRejectedValue(new Error("getaddrinfo ENOTFOUND rustfs.internal"));

    await expect(run()).rejects.toThrow("ENOTFOUND");

    const [failed] = sqlCalls("SET status = 'failed'");
    expect(failed).toContain("Import failed. Please try again.");
    expect(failed.join(" ")).not.toContain("rustfs");
  });

  it("fails the job when a folder cannot be created instead of filing notes elsewhere", async () => {
    serveZip(buildZip([["Course/a.md", "a"]]));
    mocks.sql.mockImplementation(async (...call: unknown[]) => {
      const text = queryText(call);
      if (text.includes("SET status = 'processing'")) return [{ id: JOB }];
      if (text.includes("FROM app.canvas_import_jobs") && text.includes("FOR KEY SHARE")) return [{ id: JOB }];
      if (text.includes("RETURNING cancel_requested_at")) return [{ cancel_requested_at: null }];
      if (text.includes("INSERT INTO app.notes")) throw new Error("deadlock detected");
      return [];
    });

    await expect(run()).rejects.toThrow("Could not import 1 file");

    expect(mocks.insertNoteWithTree).not.toHaveBeenCalled();
  });
});
