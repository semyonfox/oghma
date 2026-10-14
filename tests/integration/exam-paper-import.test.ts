import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import sql from "@/database/pgsql";
import { createNoteWithTree } from "@/lib/notes/storage/create-note";
import { anchorFromQuote, isCurrentAnchor } from "@/lib/study-map/evidence";
import { importExamPaper } from "@/lib/study-map/import-paper";
import {
  createStudyMap,
  removeStudyMaterial,
  syncStudyMaterials,
} from "@/lib/study-map/mutations";
import {
  examPaperImportSchema,
  type ExamPaperImport,
} from "@/lib/study-map/paper-import-format";
import {
  getStudyMapSnapshot,
  loadStudySource,
} from "@/lib/study-map/repository";
import type { MaterialOverrides } from "@/lib/study-map/types";

// object storage, tree cache and the reindex queue are the only fakes; postgres is real
const mocks = vi.hoisted(() => {
  const stored = new Set<string>();
  return {
    stored,
    putObject: vi.fn(async (key: string, _body: Buffer, _options: unknown) => {
      stored.add(key);
    }),
    deleteObject: vi.fn(async (key: string) => {
      stored.delete(key);
    }),
    enqueue: vi.fn(async (_noteId: string, _userId: string) => undefined),
    invalidate: vi.fn(
      async (_userId: string, _parentId: string | null | undefined) =>
        undefined,
    ),
  };
});
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({
    putObject: mocks.putObject,
    deleteObject: mocks.deleteObject,
  }),
}));
vi.mock("@/lib/notes/tree-cache", () => ({
  invalidateTreeAfterPublish: mocks.invalidate,
}));
vi.mock("@/lib/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue")>()),
  enqueueNoteReindexJob: mocks.enqueue,
}));

function dedicatedDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error(
      "Run exam paper integration tests against the disposable exam database.",
    );
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const dedicated = url.port === "55489" && url.pathname === "/oghma_exam_e2e";
  const ci =
    process.env.CI === "true" &&
    url.port === "5432" &&
    url.pathname === "/oghma_e2e";
  if (!local || (!dedicated && !ci)) {
    throw new Error(
      "Exam paper integration tests require the disposable local exam database, or the isolated oghma_e2e database in CI.",
    );
  }
  return value;
}

const fixture = postgres(dedicatedDatabaseUrl(), {
  max: 3,
  connection: { statement_timeout: 5_000 },
});
const courseId = "424242";
const courseYear = "2026/2027";
let userId: string;
let otherUserId: string;
let rootId: string;
let mapId: string;

const paperText = [
  "[Page 1]",
  "OLLSCOIL NA GAILLIMHE",
  "CT318 Human Computer Interaction",
  "Answer any two questions.",
  "",
  "[Page 2]",
  "Question 1",
  "Explain the gulf of execution with an example. [10 marks]",
  "",
].join("\n");

function examPaper(): ExamPaperImport {
  const pdf = Buffer.from(`%PDF-1.4\n% synthetic ${randomUUID()}\n%%EOF\n`);
  // an older repeat sitting imported into the current course
  return examPaperImportSchema.parse({
    format: "oghma-exam-paper",
    version: 1,
    filename: "2021_2022_CT318_1_2_13.pdf",
    title: "Human Computer Interaction",
    moduleCode: "CT318",
    academicYear: "2021/2022",
    sitting: 2,
    period: 13,
    archiveId: "98765",
    sha256: createHash("sha256").update(pdf).digest("hex"),
    pdfBase64: pdf.toString("base64"),
    text: paperText,
    warnings: [],
  });
}

interface NoteRow {
  note_id: string;
  title: string;
  content: string;
  s3_key: string | null;
  deleted_at: Date | null;
  canvas_course_id: string | null;
  canvas_academic_year: string | null;
  extracted_from_note_id: string | null;
  extraction_coverage: { source?: string } | null;
  parent_id: string | null;
}

async function paperNotes(owner = userId) {
  return fixture<NoteRow[]>`
    SELECT n.note_id, n.title, n.content, n.s3_key, n.deleted_at, n.canvas_course_id,
      n.canvas_academic_year, n.extracted_from_note_id, n.extraction_coverage, t.parent_id
    FROM app.notes n LEFT JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.user_id = ${owner}::uuid AND n.title LIKE '2021_2022_CT318%'
    ORDER BY n.title
  `;
}

async function attachments() {
  return fixture<
    { note_id: string; s3_key: string; mime_type: string; file_size: number }[]
  >`
    SELECT note_id, s3_key, mime_type, file_size::int AS file_size FROM app.attachments
    WHERE user_id = ${userId}::uuid ORDER BY id
  `;
}

async function materials() {
  return fixture<
    {
      note_id: string;
      kind: string;
      labels: string[];
      excluded: boolean;
      overrides: MaterialOverrides | Record<string, never>;
    }[]
  >`
    SELECT note_id, kind, labels, excluded, overrides FROM app.study_materials
    WHERE user_id = ${userId}::uuid AND map_id = ${mapId}::uuid ORDER BY excluded, note_id
  `;
}

beforeEach(async () => {
  mocks.stored.clear();
  mocks.putObject.mockImplementation(async (key: string) => {
    mocks.stored.add(key);
  });
  userId = randomUUID();
  otherUserId = randomUUID();
  for (const owner of [userId, otherUserId]) {
    await fixture`INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
      VALUES (${owner}::uuid, ${`exam-import-${owner}@example.test`}, 'synthetic', TRUE, TRUE)`;
  }
  rootId = randomUUID();
  await createNoteWithTree({
    noteId: rootId,
    userId,
    title: "CT318 module",
    content: "",
    isFolder: true,
  });
  mapId = await createStudyMap(userId, {
    name: "CT318",
    academicYear: courseYear,
    rootNoteId: rootId,
    canvasCourseId: courseId,
    syllabusNoteId: null,
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture`DELETE FROM app.login WHERE user_id IN (${userId}::uuid, ${otherUserId}::uuid)`;
});

afterAll(async () => {
  await Promise.all([fixture.end(), sql.end()]);
});

describe("exam paper import", () => {
  it("publishes the PDF, attachment and page text as one course past paper with resolvable page anchors", async () => {
    const input = examPaper();
    const result = await importExamPaper(userId, mapId, input);
    expect(result).toMatchObject({ duplicate: false, indexing: "queued" });

    const notes = await paperNotes();
    expect(notes).toHaveLength(2);
    const pdf = notes.find((note) => note.note_id === result.noteId);
    const text = notes.find((note) => note.note_id === result.textNoteId);
    if (!pdf || !text) throw new Error("The imported note pair is missing.");
    expect(pdf).toMatchObject({
      note_id: result.noteId,
      title: "2021_2022_CT318_1_2_13_98765.pdf",
      content: "",
      parent_id: rootId,
      canvas_course_id: courseId,
      canvas_academic_year: courseYear,
      extracted_from_note_id: null,
    });
    expect(text).toMatchObject({
      note_id: result.textNoteId,
      title: "2021_2022_CT318_1_2_13_98765.md",
      content: paperText,
      s3_key: null,
      parent_id: rootId,
      canvas_course_id: courseId,
      canvas_academic_year: courseYear,
      extracted_from_note_id: result.noteId,
      extraction_coverage: { source: "exam-paper-import" },
    });
    expect(await attachments()).toEqual([
      {
        note_id: result.noteId,
        s3_key: pdf.s3_key,
        mime_type: "application/pdf",
        file_size: Buffer.from(input.pdfBase64, "base64").length,
      },
    ]);
    expect([...mocks.stored]).toEqual([pdf.s3_key]);

    // the paper keeps its own year in labels while the notes carry the course year
    const source = await loadStudySource(userId, result.noteId);
    expect(source).toMatchObject({
      noteId: result.textNoteId,
      field: "content",
      text: paperText,
    });
    const [paper, excludedText] = await materials();
    expect(paper).toMatchObject({
      note_id: result.noteId,
      kind: "past_paper",
      labels: ["CT318", "2021/2022", "Sitting 2", "Period 13"],
      excluded: false,
      overrides: {
        kind: "past_paper",
        labels: ["CT318", "2021/2022", "Sitting 2", "Period 13"],
        sourceHash: source.hash,
      },
    });
    expect(excludedText).toMatchObject({
      note_id: result.textNoteId,
      excluded: true,
    });

    const anchor = anchorFromQuote(
      source,
      "Explain the gulf of execution with an example.",
    );
    expect(anchor).toMatchObject({
      noteId: result.textNoteId,
      page: 2,
      line: 8,
    });
    if (!anchor) throw new Error("The page 2 question did not anchor.");
    expect(isCurrentAnchor(anchor, source)).toBe(true);
    expect(anchorFromQuote(source, "Answer any two questions.")?.page).toBe(1);

    // folder and course sync must not turn the text into a second material
    await syncStudyMaterials(userId, mapId);
    expect(await materials()).toEqual([paper, excludedText]);
    const snapshot = await getStudyMapSnapshot(userId, mapId);
    expect(snapshot.materials).toHaveLength(1);
    expect(snapshot.materials[0]).toMatchObject({
      noteId: result.noteId,
      kind: "past_paper",
      isFile: true,
      currentHash: source.hash,
      references: expect.arrayContaining([
        expect.objectContaining({
          id: result.textNoteId,
          relation: "extraction",
        }),
      ]),
    });

    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(userId, rootId);
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith(
      result.textNoteId,
      userId,
    );
  });

  it("repeats keep edited text and map removals, and only requeue indexing", async () => {
    const input = examPaper();
    const first = await importExamPaper(userId, mapId, input);
    const edited = `${paperText}\nMy marking notes.`;
    await fixture`UPDATE app.notes SET content = ${edited} WHERE user_id = ${userId}::uuid AND note_id = ${first.textNoteId}::uuid`;
    await removeStudyMaterial(userId, mapId, first.noteId);

    mocks.enqueue.mockRejectedValueOnce(new Error("redis unavailable"));
    const failedQueue = await importExamPaper(userId, mapId, input);
    const retried = await importExamPaper(userId, mapId, input);
    expect(failedQueue).toEqual({
      noteId: first.noteId,
      textNoteId: first.textNoteId,
      duplicate: true,
      indexing: "retry-needed",
    });
    expect(retried).toMatchObject({ duplicate: true, indexing: "queued" });

    const notes = await paperNotes();
    expect(notes).toHaveLength(2);
    expect(
      notes.find((note) => note.note_id === first.textNoteId)?.content,
    ).toBe(edited);
    expect(await attachments()).toHaveLength(1);
    expect((await materials()).map((row) => row.excluded)).toEqual([
      true,
      true,
    ]);
    expect(mocks.putObject).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledTimes(3);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("publishes one pair from concurrent imports and removes only the losing upload", async () => {
    const input = examPaper();
    // hold both uploads until each request has passed its duplicate pre-check
    let arrived = 0;
    let releaseUploads = () => {};
    const uploadsReady = new Promise<void>((resolve) => {
      releaseUploads = resolve;
    });
    mocks.putObject.mockImplementation(async (key: string) => {
      mocks.stored.add(key);
      arrived += 1;
      if (arrived === 2) releaseUploads();
      await uploadsReady;
    });

    const results = await Promise.all([
      importExamPaper(userId, mapId, input),
      importExamPaper(userId, mapId, input),
    ]);
    expect(results.map((result) => result.duplicate).sort()).toEqual([
      false,
      true,
    ]);
    const notes = await paperNotes();
    expect(notes).toHaveLength(2);
    const pdf = notes.find((note) => note.note_id === results[0].noteId);
    if (!pdf) throw new Error("The imported PDF note is missing.");
    expect(await attachments()).toEqual([
      expect.objectContaining({ note_id: pdf.note_id, s3_key: pdf.s3_key }),
    ]);
    expect(await materials()).toHaveLength(2);
    expect(mocks.putObject).toHaveBeenCalledTimes(2);
    expect(mocks.deleteObject).toHaveBeenCalledOnce();
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(pdf.s3_key);
    expect([...mocks.stored]).toEqual([pdf.s3_key]);
  });

  it("rejects another user's map before uploading", async () => {
    await expect(
      importExamPaper(otherUserId, mapId, examPaper()),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(await paperNotes(otherUserId)).toEqual([]);
    expect(await paperNotes()).toEqual([]);
  });

  it.each(["trashed PDF", "unlinked text"])(
    "refuses to revive or overwrite a %s",
    async (damage) => {
      const input = examPaper();
      const first = await importExamPaper(userId, mapId, input);
      if (damage === "trashed PDF")
        await fixture`UPDATE app.notes SET deleted_at = NOW() WHERE user_id = ${userId}::uuid AND note_id = ${first.noteId}::uuid`;
      else
        await fixture`UPDATE app.notes SET extracted_from_note_id = NULL WHERE user_id = ${userId}::uuid AND note_id = ${first.textNoteId}::uuid`;
      const before = await paperNotes();

      await expect(importExamPaper(userId, mapId, input)).rejects.toMatchObject(
        { statusCode: 409 },
      );
      expect(await paperNotes()).toEqual(before);
      expect(mocks.putObject).toHaveBeenCalledOnce();
      expect(mocks.enqueue).toHaveBeenCalledOnce();
    },
  );

  it("removes its upload when the map folder is trashed after the pre-check", async () => {
    await fixture`UPDATE app.notes SET deleted_at = NOW() WHERE user_id = ${userId}::uuid AND note_id = ${rootId}::uuid`;
    await expect(
      importExamPaper(userId, mapId, examPaper()),
    ).rejects.toMatchObject({ statusCode: 409 });
    const [key] = mocks.putObject.mock.calls.map(([uploaded]) => uploaded);
    expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith(key);
    expect(mocks.stored.size).toBe(0);
    expect(await paperNotes()).toEqual([]);
    expect(await attachments()).toEqual([]);
    expect(await materials()).toEqual([]);
  });
});
