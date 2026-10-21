import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queries,
  sqlMock,
  beginMock,
  storage,
  insertNoteWithTree,
  enqueueCanvasJob,
  invalidateTreeAfterPublish,
} =
  vi.hoisted(() => {
    const queries: string[] = [];
    const sqlMock = vi.fn(
      async (strings: TemplateStringsArray, ..._values: unknown[]): Promise<Record<string, unknown>[]> => {
        queries.push(strings.join("?").replace(/\s+/g, " ").trim());
        return [{ id: "row" }];
      },
    );
    const beginMock = vi.fn(
      async (callback: (tx: typeof sqlMock) => Promise<unknown>) => callback(sqlMock),
    );
    return {
      queries,
      sqlMock,
      beginMock,
      storage: { putObject: vi.fn(), deleteObject: vi.fn() },
      insertNoteWithTree: vi.fn(),
      enqueueCanvasJob: vi.fn(),
      invalidateTreeAfterPublish: vi.fn(),
    };
  });

vi.mock("@/database/pgsql", () => ({
  default: Object.assign(sqlMock, { begin: beginMock }),
}));
vi.mock("@/lib/auth/session", () => ({
  validateSession: vi.fn(async () => ({
    user_id: "00000000-0000-0000-0000-0000000000aa",
    email: "reader@example.com",
  })),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob }));
vi.mock("@/lib/config", () => ({
  config: { upload: { maxFileSizeBytes: 1024 * 1024 } },
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree,
  InvalidNoteParentError: class InvalidNoteParentError extends Error {},
}));
vi.mock("@/lib/notes/tree-cache", () => ({ invalidateTreeAfterPublish }));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: () => storage }));

import { POST } from "@/app/api/upload/route";

const noteId = "00000000-0000-0000-0000-000000000001";

function upload(file: File, existingNoteId?: string, besideNoteId?: string) {
  const form = new FormData();
  if (existingNoteId) form.append("noteId", existingNoteId);
  if (besideNoteId) form.append("besideNoteId", besideNoteId);
  form.append("file", file);
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

const pdf = (name: string) =>
  new File([Buffer.from("%PDF-1.7\n")], name, { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    queries.push(strings.join("?").replace(/\s+/g, " ").trim());
    return [{ id: "row" }];
  });
  beginMock.mockImplementation(async (callback) => callback(sqlMock));
  storage.putObject.mockResolvedValue(undefined);
  storage.deleteObject.mockResolvedValue(undefined);
  enqueueCanvasJob.mockResolvedValue(undefined);
});

describe("POST /api/upload", () => {
  it("places a file dropped into a note in that note's folder", async () => {
    const folderId = "00000000-0000-0000-0000-0000000000f1";
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim();
      queries.push(query);
      return query.startsWith("SELECT t.parent_id") ? [{ parent_id: folderId }] : [{ id: "row" }];
    });

    const response = await POST(upload(pdf("lecture.pdf"), undefined, noteId));

    expect(response.status).toBe(200);
    expect(insertNoteWithTree).toHaveBeenCalledWith(
      sqlMock,
      expect.objectContaining({ title: "lecture.pdf", parentId: folderId }),
    );
    expect(invalidateTreeAfterPublish).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-0000000000aa",
      folderId,
    );
  });

  it("refuses to place a file beside a note that is gone and removes the object", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim();
      queries.push(query);
      return query.startsWith("SELECT t.parent_id") ? [] : [{ id: "row" }];
    });

    const response = await POST(upload(pdf("lecture.pdf"), undefined, noteId));

    expect(response.status).toBe(404);
    expect(insertNoteWithTree).not.toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledOnce();
  });

  it("rejects besideNoteId when uploading into an existing note", async () => {
    const response = await POST(upload(pdf("lecture.pdf"), noteId, noteId));

    expect(response.status).toBe(400);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("titles a new note with the real filename and keys the object with a safe one", async () => {
    const response = await POST(upload(pdf("Léacht 3 Nótaí.pdf")));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.createdNewNote).toBe(true);
    expect(body.fileName).toBe("L_acht_3_N_ta_.pdf");
    expect(body.path).toBe(`notes/${body.noteId}/${body.attachmentId}/L_acht_3_N_ta_.pdf`);
    expect(insertNoteWithTree).toHaveBeenCalledWith(
      sqlMock,
      expect.objectContaining({ title: "Léacht 3 Nótaí.pdf", s3Key: body.path }),
    );
    expect(invalidateTreeAfterPublish).toHaveBeenCalledWith("00000000-0000-0000-0000-0000000000aa", null);
    // the companion .md is titled from this and paired with the source by title
    expect(enqueueCanvasJob).toHaveBeenCalledWith(
      "extract",
      expect.objectContaining({ filename: "Léacht 3 Nótaí.pdf", s3Key: body.path }),
    );
  });

  it("writes the object before any rows so a failed insert leaves no empty note behind", async () => {
    const order: string[] = [];
    storage.putObject.mockImplementation(async () => { order.push("put"); });
    insertNoteWithTree.mockImplementation(async () => { order.push("note"); });
    beginMock.mockImplementationOnce(async (callback) => {
      await callback(sqlMock);
      throw new Error("commit failed");
    });

    const response = await POST(upload(pdf("lecture.pdf")));

    expect(response.status).toBe(500);
    expect(order).toEqual(["put", "note"]);
    expect(storage.deleteObject).toHaveBeenCalledOnce();
    expect(enqueueCanvasJob).not.toHaveBeenCalled();
    expect(invalidateTreeAfterPublish).not.toHaveBeenCalled();
  });

  it("records the extraction job in the same transaction as the attachment", async () => {
    await POST(upload(pdf("lecture.pdf"), noteId));

    const inTransaction = queries.filter((query) => query.startsWith("INSERT"));
    expect(inTransaction).toEqual([
      expect.stringContaining("INSERT INTO app.attachments"),
      expect.stringContaining("INSERT INTO app.ingestion_jobs"),
    ]);
    expect(beginMock).toHaveBeenCalledOnce();
  });

  it("marks the job failed when it cannot be queued so the client stops polling", async () => {
    enqueueCanvasJob.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(upload(pdf("lecture.pdf"), noteId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ingestionStatus).toBe("failed-to-queue");
    expect(queries.at(-1)).toMatch(
      /^UPDATE app\.ingestion_jobs SET status = 'failed'.*AND s3_key = \? AND status = 'pending'$/,
    );
  });

  it("returns 404 and removes the object when the note is trashed mid-upload", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      // the pre-check sees the note, the guarded insert no longer does
      return query.includes("INSERT INTO app.attachments") ? [] : [{ id: "row" }];
    });

    const response = await POST(upload(pdf("lecture.pdf"), noteId));

    expect(response.status).toBe(404);
    expect(storage.deleteObject).toHaveBeenCalledWith(storage.putObject.mock.calls[0]?.[0]);
    expect(queries.some((query) => query.includes("ingestion_jobs"))).toBe(false);
  });

  it("accepts a Markdown file the browser sent without a MIME type", async () => {
    const markdown = new File(["# Notes\n"], "week 1.md", { type: "" });

    const response = await POST(upload(markdown, noteId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("text/markdown");
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      { contentType: "text/markdown" },
    );
  });
});
