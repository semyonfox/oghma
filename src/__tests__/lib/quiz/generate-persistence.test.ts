import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSql, mockGenerateText, mockRecordActivationMilestone } = vi.hoisted(
  () => ({
    mockSql: vi.fn(),
    mockGenerateText: vi.fn(),
    mockRecordActivationMilestone: vi.fn(),
  }),
);

vi.mock("@/database/pgsql.js", () => ({ default: mockSql }));
vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/ai-config", () => ({
  buildReasoningOptions: vi.fn(() => ({})),
  createLlmProvider: vi.fn(() => vi.fn(() => "test-model")),
  getLlmMaxTokens: vi.fn(() => 1000),
  getLlmModel: vi.fn(() => "test-model"),
  getLlmReasoningEffort: vi.fn(() => "medium"),
  getLlmThinkingMode: vi.fn(() => "off"),
}));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: mockRecordActivationMilestone,
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { generateQuestion } from "@/lib/quiz/generate";

describe("quiz card persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        question_text: "What is a stack?",
        options: null,
        correct_answer: "A LIFO collection",
        explanation: "The most recent item is removed first.",
      }),
    });
    mockRecordActivationMilestone.mockResolvedValue(true);
  });

  it("records the first-flashcard milestone only after creating a new card", async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await generateQuestion(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "Stacks remove the most recently inserted item first.",
      "Data Structures",
      1,
      "fill_in",
    );

    expect(result).not.toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(4);
    expect(mockRecordActivationMilestone).toHaveBeenCalledWith(
      "first_flashcard_generated",
      "00000000-0000-4000-8000-000000000001",
    );
    expect(mockSql.mock.invocationCallOrder[3]).toBeLessThan(
      mockRecordActivationMilestone.mock.invocationCallOrder[0],
    );
  });

  it("does not record another milestone when the question already exists", async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: "00000000-0000-4000-8000-000000000004",
        question_text: "Existing question",
        options: null,
        correct_answer: "Existing answer",
        explanation: "Existing explanation",
      },
    ]);

    const result = await generateQuestion(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "Stacks remove the most recently inserted item first.",
      "Data Structures",
      1,
      "fill_in",
    );

    expect(result?.question_text).toBe("Existing question");
    expect(mockRecordActivationMilestone).not.toHaveBeenCalled();
  });
});
