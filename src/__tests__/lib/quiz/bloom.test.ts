import { describe, it, expect } from "vitest";
import { nextBloomLevel, pickQuestionType } from "@/lib/quiz/bloom";

describe("next bloom level for a chunk", () => {
  it("starts a new chunk at Understand", () => {
    expect(nextBloomLevel([], [])).toBe(2);
  });

  it("steps up once the hardest question was right twice in a row", () => {
    const reviews = [
      { bloom_level: 2, was_correct: false },
      { bloom_level: 2, was_correct: true },
      { bloom_level: 2, was_correct: true },
    ];
    expect(nextBloomLevel([2], reviews)).toBe(3);
  });

  it("waits while the hardest question is still being missed", () => {
    const reviews = [
      { bloom_level: 2, was_correct: true },
      { bloom_level: 3, was_correct: true },
      { bloom_level: 3, was_correct: false },
    ];
    expect(nextBloomLevel([2, 3], reviews)).toBeNull();
  });

  it("stops at Analyse", () => {
    const reviews = [
      { bloom_level: 4, was_correct: true },
      { bloom_level: 4, was_correct: true },
    ];
    expect(nextBloomLevel([2, 3, 4], reviews)).toBeNull();
  });

  it("picks a valid question type for each bloom level", () => {
    expect(["mcq", "true_false"]).toContain(pickQuestionType(1));
    expect(["mcq", "true_false", "fill_in"]).toContain(pickQuestionType(2));
    expect(["mcq", "fill_in"]).toContain(pickQuestionType(3));
    expect(["mcq", "fill_in"]).toContain(pickQuestionType(4));
  });
});
