import { describe, expect, it } from "vitest";
import {
  buildGenerationPrompt,
  parseGeneratedQuestion,
} from "@/lib/quiz/generate";

// ─── buildGenerationPrompt ───────────────────────────────────────────────────

describe("buildGenerationPrompt", () => {
  it("includes chunk text verbatim in the prompt", () => {
    const prompt = buildGenerationPrompt(
      "Dijkstra's algorithm finds shortest paths.",
      "CT216",
      1,
      "mcq",
    );
    expect(prompt).toContain("Dijkstra's algorithm finds shortest paths.");
  });

  it("includes module name", () => {
    const prompt = buildGenerationPrompt("some content", "CT313 AI", 3, "mcq");
    expect(prompt).toContain("CT313 AI");
  });

  it("tells LLM to generate MCQ with 4 options", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 1, "mcq");
    expect(prompt).toMatch(/4 options/i);
    expect(prompt).toMatch(/multiple choice/i);
  });

  it("tells LLM to generate true/false with two named options", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 1, "true_false");
    expect(prompt).toMatch(/true\/false/i);
    expect(prompt).toContain("True");
    expect(prompt).toContain("False");
  });

  it("can force true/false questions to have True as correct", () => {
    const prompt = buildGenerationPrompt(
      "content",
      "Mod",
      1,
      "true_false",
      undefined,
      "true",
    );
    expect(prompt).toContain("The correct option MUST be True");
  });

  it("tells LLM to generate fill-in-the-blank with null options", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 1, "fill_in");
    expect(prompt).toMatch(/fill.in.the.blank/i);
    expect(prompt).toMatch(/options.*null/i);
  });

  it("includes bloom level name for level 1 (Remember)", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 1, "mcq");
    expect(prompt).toContain("Remember");
  });

  it("includes bloom level name for level 4 (Analyze)", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 4, "mcq");
    expect(prompt).toContain("Analyze");
  });

  it("always requests JSON output", () => {
    const prompt = buildGenerationPrompt("content", "Mod", 2, "mcq");
    expect(prompt).toContain("question_text");
    expect(prompt).toContain("correct_answer");
    expect(prompt).toContain("explanation");
  });
});

// ─── parseGeneratedQuestion ──────────────────────────────────────────────────

describe("parseGeneratedQuestion", () => {
  it("parses bare JSON without a code fence", () => {
    const raw = JSON.stringify({
      question_text: "What is recursion?",
      options: null,
      correct_answer: "A function calling itself",
      explanation: "Recursion is self-referential.",
    });
    const result = parseGeneratedQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.options).toBeNull();
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const raw = `\`\`\`json
{
  "question_text": "Define stack",
  "options": [{"text":"LIFO","is_correct":true},{"text":"FIFO","is_correct":false}],
  "correct_answer": "LIFO",
  "explanation": "Stacks are last-in, first-out."
}
\`\`\``;
    const result = parseGeneratedQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.question_text).toBe("Define stack");
    expect(result!.options).toHaveLength(2);
  });

  it("parses JSON wrapped in a plain code fence (no language tag)", () => {
    const raw = `\`\`\`
{"question_text":"Q","options":null,"correct_answer":"A","explanation":"E"}
\`\`\``;
    const result = parseGeneratedQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.correct_answer).toBe("A");
  });

  it("defaults explanation to empty string when missing", () => {
    const raw = JSON.stringify({
      question_text: "Q?",
      options: null,
      correct_answer: "A",
    });
    const result = parseGeneratedQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.explanation).toBe("");
  });

  it("returns null when question_text is empty", () => {
    const raw = JSON.stringify({
      question_text: "",
      options: null,
      correct_answer: "A",
      explanation: "E",
    });
    expect(parseGeneratedQuestion(raw)).toBeNull();
  });

  it("returns null when correct_answer is empty", () => {
    const raw = JSON.stringify({
      question_text: "Q?",
      options: null,
      correct_answer: "   ",
      explanation: "E",
    });
    expect(parseGeneratedQuestion(raw)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseGeneratedQuestion("not json at all")).toBeNull();
    expect(parseGeneratedQuestion("{broken")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGeneratedQuestion("")).toBeNull();
  });

  it("handles LLM response with surrounding whitespace/newlines", () => {
    const raw = `  \n  ${JSON.stringify({
      question_text: "Q?",
      options: null,
      correct_answer: "A",
      explanation: "E",
    })}  \n  `;
    expect(parseGeneratedQuestion(raw)).not.toBeNull();
  });
});
