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

    expect(mockGenerateQuestion).toHaveBeenCalledWith({
      userId: "user-1",
      noteId: "note-1",
      chunkId: "chunk-1",
      chunkText: "Primary chunk text",
      moduleName: "Module title",
      bloomLevel: 1,
      questionType: "mcq",
      courseId: undefined,
    });
  });

  it("does not start a second generation for a chunk already in flight", async () => {
    let finish: (value: { id: string }) => void = () => {};
    mockGenerateQuestion.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const first = generateBatch("user-1", ["chunk-1"]);
    await vi.waitFor(() => expect(mockGenerateQuestion).toHaveBeenCalledTimes(1));
    await expect(generateBatch("user-1", ["chunk-1"])).resolves.toBe(0);
    expect(mockGenerateQuestion).toHaveBeenCalledTimes(1);

    finish({ id: "question-1" });
    await expect(first).resolves.toBe(1);
  });

  it("releases the chunk once generation finishes so a later pass can retry", async () => {
    mockGenerateQuestion.mockResolvedValue(null);
    await generateBatch("user-1", ["chunk-1"]);

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
    await generateBatch("user-1", ["chunk-1"]);

    expect(mockGenerateQuestion).toHaveBeenCalledTimes(2);
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
