import { describe, it, expect } from "vitest";
import {
  normalizeQuizOptions,
  normalizeQuizQuestion,
} from "@/lib/quiz/normalize-question";

describe("normalizeQuizOptions", () => {
  it("returns null for null input", () => {
    expect(normalizeQuizOptions(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeQuizOptions(undefined)).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(normalizeQuizOptions([])).toBeNull();
  });

  it("passes through a valid option array", () => {
    const input = [
      { text: "True", is_correct: true },
      { text: "False", is_correct: false },
    ];
    const result = normalizeQuizOptions(input);
    expect(result).toEqual(input);
  });

  it("parses a valid JSON string of options", () => {
    const raw = JSON.stringify([
      { text: "A", is_correct: true },
      { text: "B", is_correct: false },
    ]);
    const result = normalizeQuizOptions(raw);
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ text: "A", is_correct: true });
  });

  it("returns null for an empty JSON array string", () => {
    expect(normalizeQuizOptions("[]")).toBeNull();
  });

  it("returns null for invalid JSON string", () => {
    expect(normalizeQuizOptions("not json")).toBeNull();
  });

  it("unwraps an object with an options key", () => {
    const input = {
      options: [
        { text: "X", is_correct: false },
        { text: "Y", is_correct: true },
      ],
    };
    const result = normalizeQuizOptions(input);
    expect(result).toHaveLength(2);
    expect(result![1]).toEqual({ text: "Y", is_correct: true });
  });

  it("unwraps options from a JSON string of wrapped object", () => {
    const raw = JSON.stringify({
      options: [{ text: "Z", is_correct: true }],
    });
    const result = normalizeQuizOptions(raw);
    expect(result).toHaveLength(1);
    expect(result![0].text).toBe("Z");
  });

  it("returns null when options key resolves to empty array", () => {
    expect(normalizeQuizOptions({ options: [] })).toBeNull();
  });

  it("filters out options with non-string text", () => {
    const input = [
      { text: 42, is_correct: true },
      { text: "Valid", is_correct: false },
    ];
    const result = normalizeQuizOptions(input);
    expect(result).toHaveLength(1);
    expect(result![0].text).toBe("Valid");
  });

  it("filters out options with non-boolean is_correct", () => {
    const input = [
      { text: "A", is_correct: "yes" },
      { text: "B", is_correct: true },
    ];
    const result = normalizeQuizOptions(input);
    expect(result).toHaveLength(1);
    expect(result![0].text).toBe("B");
  });

  it("filters out null entries in the array", () => {
    const input = [null, { text: "A", is_correct: true }];
    const result = normalizeQuizOptions(input);
    expect(result).toHaveLength(1);
  });

  it("returns null when all entries are invalid", () => {
    const input = [
      { text: 1, is_correct: "no" },
      null,
    ];
    expect(normalizeQuizOptions(input)).toBeNull();
  });

  it("returns null for a non-array, non-object primitive", () => {
    expect(normalizeQuizOptions(42)).toBeNull();
    expect(normalizeQuizOptions(true)).toBeNull();
  });
});

describe("normalizeQuizQuestion", () => {
  it("returns null for null input", () => {
    expect(normalizeQuizQuestion(null)).toBeNull();
  });

  it("preserves all fields and normalizes null options", () => {
    const q = { question_text: "Q?", options: null, correct_answer: "A" };
    const result = normalizeQuizQuestion(q);
    expect(result).not.toBeNull();
    expect(result!.question_text).toBe("Q?");
    expect(result!.options).toBeNull();
  });

  it("parses a JSON string in the options field", () => {
    const q = {
      question_text: "Q?",
      options: JSON.stringify([
        { text: "True", is_correct: true },
        { text: "False", is_correct: false },
      ]),
      correct_answer: "True",
    };
    const result = normalizeQuizQuestion(q);
    expect(result!.options).toHaveLength(2);
  });

  it("passes through a valid option array unchanged", () => {
    const opts = [{ text: "Opt", is_correct: true }];
    const q = { options: opts };
    const result = normalizeQuizQuestion(q);
    expect(result!.options).toEqual(opts);
  });

  it("does not mutate the original object", () => {
    const q = { options: [{ text: "A", is_correct: true }] };
    normalizeQuizQuestion(q);
    expect(q.options).toHaveLength(1);
  });
});
