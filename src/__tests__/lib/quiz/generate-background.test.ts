import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSql, mockGenerateQuestion, mockLogger } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockGenerateQuestion: vi.fn(),
  mockLogger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/database/pgsql", () => ({ default: mockSql }));
vi.mock("@/lib/quiz/generate", () => ({
  generateQuestion: mockGenerateQuestion,
}));
vi.mock("@/lib/quiz/bloom", () => ({
  getCurrentBloomLevel: vi.fn(() => 1),
  pickQuestionType: vi.fn(() => "mcq"),
}));
vi.mock("@/lib/logger", () => ({ default: mockLogger }));

import { generateBatch } from "@/lib/quiz/generate-background";

describe("generateBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql
      .mockResolvedValueOnce([
        {
          id: "chunk-1",
          text: "Primary chunk text",
          document_id: "note-1",
          title: "Module title",
          canvas_course_id: null,
        },
      ])
      .mockResolvedValueOnce([{ text: "Primary chunk text" }])
      .mockResolvedValueOnce([]);
  });

  it("counts fulfilled question generation after assembling its chunk context", async () => {
    mockGenerateQuestion.mockResolvedValue({ id: "question-1" });

    await expect(generateBatch("user-1", ["chunk-1"])).resolves.toBe(1);

    expect(mockGenerateQuestion).toHaveBeenCalledWith(
      "user-1",
      "note-1",
      "chunk-1",
      "Primary chunk text",
      "Module title",
      1,
      "mcq",
      undefined,
    );
  });

  it("logs and excludes failed chunk generation from the result", async () => {
    mockGenerateQuestion.mockRejectedValue(new Error("provider unavailable"));

    await expect(generateBatch("user-1", ["chunk-1"])).resolves.toBe(0);

    expect(mockLogger.error).toHaveBeenCalledWith(
      "background quiz generation failed for chunk",
      expect.objectContaining({ error: "provider unavailable" }),
    );
  });
});
