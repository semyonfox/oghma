import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSql, mockTx, mockGenerateText } = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (work: (query: typeof tx) => Promise<unknown>) => work(tx)),
  });
  return { mockSql: sql, mockTx: tx, mockGenerateText: vi.fn() };
});

vi.mock("@/database/pgsql", () => ({ default: mockSql }));
vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/ai-config", () => ({
  buildReasoningOptions: vi.fn(() => ({})),
  createLlmProvider: vi.fn(() => vi.fn(() => "test-model")),
  getLlmMaxTokens: vi.fn(() => 1000),
  getLlmModel: vi.fn(() => "test-model"),
  getLlmReasoningEffort: vi.fn(() => "medium"),
  getLlmThinkingMode: vi.fn(() => "off"),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { generateQuestion, type GenerateQuestionInput } from "@/lib/quiz/generate";

const INPUT: GenerateQuestionInput = {
  userId: "00000000-0000-4000-8000-000000000001",
  noteId: "00000000-0000-4000-8000-000000000002",
  chunkId: "00000000-0000-4000-8000-000000000003",
  chunkText: "Stacks remove the most recently inserted item first.",
  moduleName: "Data Structures",
  bloomLevel: 1,
  questionType: "fill_in",
};

const STORED = {
  id: "00000000-0000-4000-8000-000000000004",
  question_type: "fill_in",
  question_text: "What is a stack?",
  options: null,
  correct_answer: "A LIFO collection",
  explanation: "The most recent item is removed first.",
};

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join("?");
}

function txQueries(): string[] {
  return mockTx.mock.calls.map(queryText);
}

/**
 * Route transaction queries by their SQL so tests describe database state
 * rather than call order.
 */
function databaseState({
  existing = null,
  insertWins = true,
}: {
  existing?: typeof STORED | null;
  insertWins?: boolean;
}) {
  let stored = existing;
  mockTx.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("INSERT INTO app.quiz_questions")) {
      if (!insertWins || stored) return [];
      stored = STORED;
      return [STORED];
    }
    if (query.includes("FROM app.quiz_questions") && query.includes("bloom_level")) {
      return stored ? [stored] : [];
    }
    return [];
  });
}

describe("quiz question persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        question_text: STORED.question_text,
        options: null,
        correct_answer: STORED.correct_answer,
        explanation: STORED.explanation,
      }),
    });
  });

  it("writes the question and its card in one transaction", async () => {
    databaseState({});

    const result = await generateQuestion(INPUT);

    expect(result).toMatchObject({ id: STORED.id, chunk_id: INPUT.chunkId });
    expect(mockSql.begin).toHaveBeenCalledTimes(2);
    const queries = txQueries();
    const insertQuestion = queries.findIndex((q) => q.includes("INSERT INTO app.quiz_questions"));
    const insertCard = queries.findIndex((q) => q.includes("INSERT INTO app.quiz_cards"));
    expect(insertQuestion).toBeGreaterThanOrEqual(0);
    expect(insertCard).toBeGreaterThan(insertQuestion);
    // the insert is guarded by the chunk still belonging to a live note
    expect(queries[insertQuestion]).toContain("deleted_at IS NULL");
    expect(queries[insertQuestion]).toContain("ON CONFLICT (user_id, chunk_id, bloom_level) DO NOTHING");
  });

  it("reuses an existing question without calling the LLM and backfills its card", async () => {
    databaseState({ existing: STORED });

    const result = await generateQuestion(INPUT);

    expect(result?.question_text).toBe(STORED.question_text);
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(txQueries().some((q) => q.includes("INSERT INTO app.quiz_cards"))).toBe(true);
  });

  it("adopts the winner's row when a concurrent generator inserted first", async () => {
    let lookups = 0;
    mockTx.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("INSERT INTO app.quiz_questions")) return [];
      if (query.includes("bloom_level")) {
        // nothing before the LLM call, the other generator's row after it
        lookups += 1;
        return lookups === 1 ? [] : [{ ...STORED, question_text: "Winner" }];
      }
      return [];
    });

    const result = await generateQuestion(INPUT);

    expect(result?.question_text).toBe("Winner");
    expect(txQueries().filter((q) => q.includes("INSERT INTO app.quiz_cards"))).toHaveLength(1);
  });

  it("persists nothing when the chunk was re-indexed during the LLM call", async () => {
    databaseState({ insertWins: false });

    await expect(generateQuestion(INPUT)).resolves.toBeNull();
    expect(txQueries().some((q) => q.includes("INSERT INTO app.quiz_cards"))).toBe(false);
  });

  it("persists nothing when the LLM output fails validation", async () => {
    databaseState({});
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ question_text: "What is a stack?", correct_answer: 42 }),
    });

    await expect(generateQuestion(INPUT)).resolves.toBeNull();
    expect(txQueries().some((q) => q.includes("INSERT INTO"))).toBe(false);
  });

  it("returns null without persisting when the LLM call fails", async () => {
    databaseState({});
    mockGenerateText.mockRejectedValue(new Error("provider down"));

    await expect(generateQuestion(INPUT)).resolves.toBeNull();
    expect(txQueries().some((q) => q.includes("INSERT INTO"))).toBe(false);
  });
});
