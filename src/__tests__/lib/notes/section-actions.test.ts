import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  return {
    tx, sql: Object.assign(vi.fn(), { begin: vi.fn(async (work: (query: typeof tx) => Promise<unknown>) => work(tx)) }),
    generate: vi.fn(), summary: vi.fn(), insertNote: vi.fn(),
  };
});
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/quiz/generate", () => ({ generateSectionQuestion: mocks.generate }));
vi.mock("ai", () => ({ generateText: mocks.summary }));
vi.mock("@/lib/ai-config", () => ({ createLlmProvider: () => () => "model", getLlmModel: () => "model" }));
vi.mock("@/lib/notes/storage/create-note", () => ({ insertNoteWithTree: mocks.insertNote }));
vi.mock("@/lib/api-error", () => ({ ApiError: class extends Error { constructor(public statusCode: number, message: string) { super(message); } } }));

import { readSectionSource, runSectionAction } from "@/lib/notes/section-actions";
import { splitSections } from "@/lib/notes/sections";

const text = "# Stacks\nLIFO\n# Queues\nFIFO";
const source = { note_id: "note", text_note_id: "text-note", title: "Lecture", text };
const key = splitSections(text)[0].key;
const question = { question_text: "What order?", correct_answer: "LIFO", explanation: "Last in first out", options: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([source]);
  mocks.tx.mockImplementation(async (parts: TemplateStringsArray) => {
    const query = parts.join("?");
    if (query.includes("AS text")) return [source];
    if (query.includes("RETURNING id")) return [{ id: "created" }];
    if (query.includes("SELECT parent_id")) return [{ parent_id: "folder" }];
    return [];
  });
  mocks.generate.mockResolvedValue(question);
  mocks.summary.mockResolvedValue({ text: "A stack uses LIFO.", finishReason: "stop" });
  mocks.insertNote.mockResolvedValue({ noteId: "summary" });
});

describe("section actions", () => {
  it("requires a live owned note and matches keys before calling a provider", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    await expect(readSectionSource("user", "note")).rejects.toMatchObject({ statusCode: 404 });
    await expect(runSectionAction("user", "note", "../../other", "cards")).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.generate).not.toHaveBeenCalled();
    const query = mocks.sql.mock.calls[0][0].join("?");
    expect(query).toContain("n.user_id =");
    expect(query).toContain("n.deleted_at IS NULL");
  });

  it("generates only from the selected section and saves schedulable cards with provenance", async () => {
    const result = await runSectionAction("user", "note", key, "cards");
    expect(mocks.generate.mock.calls).toEqual([1, 2, 3].map((level) => ["# Stacks\nLIFO", "Stacks", level]));
    expect(result).toHaveProperty("cards");
    const inserts = mocks.tx.mock.calls.filter(([parts]) => parts.join("").includes("INSERT INTO app.quiz_questions"));
    expect(inserts).toHaveLength(3);
    expect(inserts[0][0].join("")).toContain("'section'");
    expect(inserts[0][0].join("")).toContain("source_section");
    expect(inserts[0]).toContain(key);
    expect(mocks.tx.mock.calls.filter(([parts]) => parts.join("").includes("INSERT INTO app.quiz_cards"))).toHaveLength(3);
  });

  it("saves the summary as a linked note in the source folder", async () => {
    await expect(runSectionAction("user", "note", key, "summary")).resolves.toEqual({ noteId: "summary", parentId: "folder" });
    expect(mocks.summary.mock.calls[0][0].prompt).toBe("# Stacks\nLIFO");
    expect(mocks.insertNote.mock.calls[0][1]).toMatchObject({ title: "Stacks.md", parentId: "folder", requestReindex: false });
    const link = mocks.tx.mock.calls.find(([parts]) => parts.join("").includes("SET extracted_from_note_id"));
    expect(link).toContain("text-note");
  });

  it("rejects output if the source changes or disappears during generation", async () => {
    mocks.tx.mockImplementation(async (parts: TemplateStringsArray) => parts.join("").includes("AS text") ? [{ ...source, text: "edited" }] : []);
    await expect(runSectionAction("user", "note", key, "cards")).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.tx.mock.calls.some(([parts]) => parts.join("").includes("INSERT"))).toBe(false);
    mocks.tx.mockResolvedValue([]);
    await expect(runSectionAction("user", "note", key, "summary")).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.insertNote).not.toHaveBeenCalled();
  });

  it("saves no empty or truncated output", async () => {
    mocks.summary.mockResolvedValue({ text: "unfinished", finishReason: "length" });
    await expect(runSectionAction("user", "note", key, "summary")).rejects.toMatchObject({ statusCode: 502 });
    mocks.generate.mockResolvedValue(null);
    await expect(runSectionAction("user", "note", key, "cards")).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.sql.begin).not.toHaveBeenCalled();
  });
});
