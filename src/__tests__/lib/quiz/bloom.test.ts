import { describe, it, expect } from "vitest";
import {
  getCurrentBloomLevel,
  pickQuestionType,
} from "@/lib/quiz/bloom";

describe("bloom level tracking", () => {
  it("returns level 1 when no reviews exist", () => {
    const level = getCurrentBloomLevel([]);
    expect(level).toBe(1);
  });

  it("moves up when recent accuracy is very high (zpd upshift)", () => {
    const reviews = [
      { bloom_level: 2, was_correct: true },
      { bloom_level: 2, was_correct: true },
      { bloom_level: 2, was_correct: true },
      { bloom_level: 2, was_correct: true },
    ];
    expect(getCurrentBloomLevel(reviews)).toBe(3);
  });

  it("moves down when recent accuracy is too low (zpd downshift)", () => {
    const reviews = [
      { bloom_level: 3, was_correct: false },
      { bloom_level: 3, was_correct: false },
      { bloom_level: 3, was_correct: true },
      { bloom_level: 3, was_correct: false },
    ];
    expect(getCurrentBloomLevel(reviews)).toBe(2);
  });

  it("picks a valid question type for each bloom level", () => {
    expect(["mcq", "true_false"]).toContain(pickQuestionType(1));
    expect(["mcq", "true_false", "fill_in"]).toContain(pickQuestionType(2));
    expect(["mcq", "fill_in"]).toContain(pickQuestionType(3));
    expect(["mcq", "fill_in"]).toContain(pickQuestionType(4));
  });
});
