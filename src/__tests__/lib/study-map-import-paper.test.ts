import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importExamPaper } from "@/lib/study-map/import-paper";
import type { ExamPaperImport } from "@/lib/study-map/paper-import-format";

const mocks = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    owner: true,
    root: "33333333-3333-4333-8333-333333333333" as string | null,
    seen: false,
    existing: false,
    trashed: false,
    count: 1,
    committedAfterError: false,
  };
  const query = vi.fn(
    async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<Row[]> => {
      const text = strings.join("?");
      if (text.includes("SELECT root_note_id"))
        return state.owner ? [{ root_note_id: state.root }] : [];
      if (text.includes("AND s3_key ="))
        return state.committedAfterError ? [{ note_id: "committed" }] : [];
      if (text.includes("SELECT note_id FROM app.notes"))
        return state.seen ? [{ note_id: "seen" }] : [];
      if (text.includes("AS active")) {
        const ids = values.find(
          (value): value is string[] =>
            Array.isArray(value) &&
            value.every((item: unknown) => typeof item === "string"),
        );
        if (!ids || !state.existing) return [];
        return [
          {
            note_id: ids[0],
            active: !state.trashed,
            s3_key: "original-object",
            extracted_from_note_id: null,
          },
          {
            note_id: ids[1],
            active: true,
            s3_key: null,
            extracted_from_note_id: ids[0],
          },
        ];
      }
      if (text.includes("count(*)")) return [{ count: state.count }];
      return [];
    },
  );
  const begin = vi.fn(
    async (callback: (tx: typeof query) => Promise<unknown>) => callback(query),
  );
  const insert = vi.fn(
    async (
      _tx: unknown,
      _input: {
        noteId: string;
        parentId?: string | null;
        content: string;
        title: string;
        s3Key?: string | null;
      },
    ) => undefined,
  );
  const storage = {
    putObject: vi.fn(
      async (_key: string, _bytes: Buffer, _options: unknown) => undefined,
    ),
    deleteObject: vi.fn(async (_key: string) => undefined),
  };
  const enqueue = vi.fn(async (_noteId: string, _userId: string) => undefined);
  const invalidate = vi.fn(async () => undefined);
  return { state, query, begin, insert, storage, enqueue, invalidate };
});
vi.mock("@/database/pgsql", () => ({
  default: Object.assign(mocks.query, { begin: mocks.begin }),
}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree: mocks.insert,
  InvalidNoteParentError: class extends Error {},
}));
vi.mock("@/lib/notes/tree-cache", () => ({
  invalidateTreeAfterPublish: mocks.invalidate,
}));
vi.mock("@/lib/queue", () => ({ enqueueNoteReindexJob: mocks.enqueue }));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => mocks.storage,
}));
vi.mock("@/lib/study-map/mutations", () => ({
  lockStudyMap: vi.fn(async () => ({
    root_note_id: mocks.state.root,
    taxonomy_version: 4,
    canvas_course_id: "12345",
    academic_year: "2026/2027",
  })),
  lockStudySource: vi.fn(async () => ({
    noteId: mocks.insert.mock.calls[1]?.[1].noteId,
    hash: "b".repeat(64),
  })),
}));
const userId = "11111111-1111-4111-8111-111111111111";
const mapId = "22222222-2222-4222-8222-222222222222";
const pdf = Buffer.from("%PDF-1.7\nsynthetic exam fixture");
const input: ExamPaperImport = {
  format: "oghma-exam-paper",
  version: 1,
  filename: "2025_2026_CT318_1_1_5.pdf",
  title: "Human Computer Interaction",
  moduleCode: "CT318",
  academicYear: "2025/2026",
  sitting: 1,
  period: 5,
  archiveId: "1234",
  sha256: createHash("sha256").update(pdf).digest("hex"),
  pdfBase64: pdf.toString("base64"),
  text: "[Page 1]\nQuestion 1\nExplain a user interface.",
  warnings: [],
};
function writes(table: string) {
  return mocks.query.mock.calls.filter(([strings]) =>
    strings.join("?").includes(table),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.state, {
    owner: true,
    root: "33333333-3333-4333-8333-333333333333",
    seen: false,
    existing: false,
    trashed: false,
    count: 1,
    committedAfterError: false,
  });
});

describe("exam imports into a module", () => {
  it("stores a linked PDF and text pair in the module folder, marks only the PDF as a past paper and queues text indexing", async () => {
    const result = await importExamPaper(userId, mapId, input);
    expect(result).toMatchObject({ duplicate: false, indexing: "queued" });
    expect(mocks.insert.mock.calls.map(([, value]) => value.parentId)).toEqual([
      mocks.state.root,
      mocks.state.root,
    ]);
    expect(mocks.insert.mock.calls[1]?.[1]).toMatchObject({
      content: input.text,
      noteId: result.textNoteId,
      canvasCourseId: "12345",
      canvasAcademicYear: "2026/2027",
    });
    expect(writes("SET extracted_from_note_id")[0]).toContain(result.noteId);
    const materials = writes("INSERT INTO app.study_materials");
    expect(materials).toHaveLength(2);
    expect(materials[0]?.[0].join("?")).toContain("'past_paper'");
    expect(materials[0]).toContain(mapId);
    expect(materials[0]).toContain(
      JSON.stringify({
        kind: "past_paper",
        labels: ["CT318", "2025/2026", "Sitting 1", "Period 5"],
        topics: {},
        sourceHash: "b".repeat(64),
        taxonomyVersion: 4,
      }),
    );
    expect(materials[1]?.[0].join("?")).toContain("TRUE");
    expect(writes("app.study_papers")).toHaveLength(0);
    expect(mocks.enqueue).toHaveBeenCalledWith(result.textNoteId, userId);
  });

  it("rejects another user's map and a hash mismatch before uploading", async () => {
    mocks.state.owner = false;
    await expect(importExamPaper(userId, mapId, input)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      importExamPaper(userId, mapId, { ...input, sha256: "0".repeat(64) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.storage.putObject).not.toHaveBeenCalled();
  });

  it("refuses a map without a folder before uploading", async () => {
    mocks.state.root = null;
    await expect(importExamPaper(userId, mapId, input)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.storage.putObject).not.toHaveBeenCalled();
  });

  it("cleans up only its own object when relational publishing fails", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("transaction rolled back"));
    await expect(importExamPaper(userId, mapId, input)).rejects.toThrow(
      "transaction rolled back",
    );
    expect(mocks.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(
      mocks.storage.putObject.mock.calls[0]?.[0],
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("keeps committed files on a queue failure and a repeated import retries indexing without overwriting notes", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    const first = await importExamPaper(userId, mapId, input);
    expect(first.indexing).toBe("retry-needed");
    expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    mocks.state.seen = true;
    mocks.state.existing = true;
    const second = await importExamPaper(userId, mapId, {
      ...input,
      text: "replacement text that must not overwrite edits",
    });
    expect(second).toEqual({ ...first, duplicate: true, indexing: "queued" });
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.storage.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });

  it("preserves a PDF when a connection failure hid a successful commit", async () => {
    mocks.state.committedAfterError = true;
    mocks.insert.mockRejectedValueOnce(
      new Error("connection lost after commit"),
    );
    await expect(importExamPaper(userId, mapId, input)).rejects.toThrow(
      "connection lost",
    );
    expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("refuses to resurrect a trashed pair", async () => {
    Object.assign(mocks.state, { seen: true, existing: true, trashed: true });
    await expect(importExamPaper(userId, mapId, input)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.storage.putObject).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("removes only the losing upload when another import wins the race", async () => {
    mocks.state.existing = true;
    expect((await importExamPaper(userId, mapId, input)).duplicate).toBe(true);
    expect(mocks.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(
      mocks.storage.putObject.mock.calls[0]?.[0],
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rolls back a full module and removes the unused PDF", async () => {
    mocks.state.count = 501;
    await expect(importExamPaper(userId, mapId, input)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
