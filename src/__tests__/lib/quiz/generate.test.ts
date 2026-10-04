import { describe, expect, it } from "vitest";
import {
  buildGenerationPrompt,
  isSkipSignal,
  parseGeneratedQuestion,
} from "@/lib/quiz/generate";

describe("quiz generation provider contract", () => {
  it("includes the source, module, Bloom level, and MCQ shape", () => {
    const prompt = buildGenerationPrompt(
      "Pipelining overlaps fetch, decode, and execute stages.",
      "CT213 Computer Systems",
      2,
      "mcq",
    );

    expect(prompt).toContain(
      "Pipelining overlaps fetch, decode, and execute stages.",
    );
    expect(prompt).toContain("Module: CT213 Computer Systems");
    expect(prompt).toContain("Understand (Bloom's Taxonomy level 2)");
    expect(prompt).toContain("exactly 4 options");
    expect(prompt).toContain('"question_text"');
    expect(prompt).toContain('"correct_answer"');
  });

  it("pins the requested true/false answer", () => {
    const prompt = buildGenerationPrompt(
      "A stack is last-in, first-out.",
      "Data Structures",
      1,
      "true_false",
      undefined,
      "true",
    );

    expect(prompt).toContain("The correct option MUST be True");
    expect(prompt).toContain('{text: "True", is_correct: ...}');
    expect(prompt).toContain('{text: "False", is_correct: ...}');
  });

  it("requires null options for fill-in questions", () => {
    const prompt = buildGenerationPrompt(
      "Dijkstra's algorithm finds shortest paths.",
      "Algorithms",
      3,
      "fill_in",
    );

    expect(prompt).toContain("fill-in-the-blank question");
    expect(prompt).toContain("Set options to null");
  });

  it("includes recent questions as an anti-duplication constraint", () => {
    const prompt = buildGenerationPrompt(
      "A queue is first-in, first-out.",
      "Data Structures",
      2,
      "mcq",
      ["What is a queue?"],
    );

    expect(prompt).toContain("1. What is a queue?");
    expect(prompt).toContain("Ask about a DIFFERENT concept or aspect");
  });
});

describe("generated question parsing", () => {
  const question = {
    question_text: "Why does pipelining improve throughput?",
    options: [
      { text: "It overlaps stages", is_correct: true },
      { text: "It lowers the clock speed", is_correct: false },
      { text: "It removes data hazards", is_correct: false },
      { text: "It uses fewer instructions", is_correct: false },
    ],
    correct_answer: "It overlaps stages",
    explanation: "Several instructions can occupy different stages at once.",
  };

  it("parses the JSON object returned by the provider", () => {
    expect(parseGeneratedQuestion(JSON.stringify(question), "mcq")).toEqual(
      question,
    );
  });

  it.each([
    ["a labelled Markdown fence", `\`\`\`json\n${JSON.stringify(question)}\n\`\`\``],
    ["an unlabelled Markdown fence", `\`\`\`\n${JSON.stringify(question)}\n\`\`\``],
    ["surrounding whitespace", `  \n${JSON.stringify(question)}\n  `],
  ])("accepts provider JSON with %s", (_label, raw) => {
    expect(parseGeneratedQuestion(raw, "mcq")).toEqual(question);
  });

  it("defaults an omitted explanation without weakening required fields", () => {
    expect(
      parseGeneratedQuestion(
        JSON.stringify({
          question_text: "What is a stack?",
          options: null,
          correct_answer: "A LIFO collection",
        }),
        "fill_in",
      ),
    ).toEqual({
      question_text: "What is a stack?",
      options: null,
      correct_answer: "A LIFO collection",
      explanation: "",
    });
  });

  it.each([
    ["invalid JSON", "not JSON"],
    [
      "an empty question",
      JSON.stringify({ question_text: "", correct_answer: "answer" }),
    ],
    [
      "an empty answer",
      JSON.stringify({ question_text: "question", correct_answer: "   " }),
    ],
    [
      "wrong field types",
      JSON.stringify({ question_text: 42, correct_answer: [] }),
    ],
    [
      "malformed options",
      JSON.stringify({
        question_text: "What is a stack?",
        options: [{ text: "LIFO", is_correct: "true" }],
        correct_answer: "LIFO",
      }),
    ],
  ])("rejects %s", (_label, raw) => {
    expect(parseGeneratedQuestion(raw, "mcq")).toBeNull();
  });

  it.each([
    [
      "an MCQ with the wrong option count",
      "mcq" as const,
      { ...question, options: question.options.slice(0, 3) },
    ],
    [
      "an MCQ with a blank option",
      "mcq" as const,
      {
        ...question,
        options: question.options.map((option, index) =>
          index === 3 ? { ...option, text: "   " } : option,
        ),
      },
    ],
    [
      "an MCQ with no correct option",
      "mcq" as const,
      {
        ...question,
        options: question.options.map((option) => ({
          ...option,
          is_correct: false,
        })),
      },
    ],
    [
      "an MCQ with multiple correct options",
      "mcq" as const,
      {
        ...question,
        options: question.options.map((option, index) => ({
          ...option,
          is_correct: index < 2,
        })),
      },
    ],
    [
      "an MCQ whose answer does not match its correct option",
      "mcq" as const,
      { ...question, correct_answer: "It lowers the clock speed" },
    ],
    [
      "an MCQ with duplicate option labels",
      "mcq" as const,
      {
        ...question,
        options: question.options.map((option, index) =>
          index === 3 ? { ...option, text: " IT OVERLAPS STAGES " } : option,
        ),
      },
    ],
    [
      "a true/false question without named True and False options",
      "true_false" as const,
      {
        ...question,
        options: [
          { text: "Yes", is_correct: true },
          { text: "No", is_correct: false },
        ],
        correct_answer: "Yes",
      },
    ],
    [
      "a true/false question with the wrong option count",
      "true_false" as const,
      {
        ...question,
        options: [
          { text: "True", is_correct: true },
          { text: "False", is_correct: false },
          { text: "Unknown", is_correct: false },
        ],
        correct_answer: "True",
      },
    ],
    [
      "a fill-in question with options",
      "fill_in" as const,
      question,
    ],
  ])("rejects %s", (_label, questionType, value) => {
    expect(
      parseGeneratedQuestion(JSON.stringify(value), questionType),
    ).toBeNull();
  });

  it("accepts the requested true/false shape", () => {
    const trueFalseQuestion = {
      question_text: "A stack is last-in, first-out.",
      options: [
        { text: "True", is_correct: true },
        { text: "False", is_correct: false },
      ],
      correct_answer: "True",
      explanation: "The newest item is removed first.",
    };

    expect(
      parseGeneratedQuestion(JSON.stringify(trueFalseQuestion), "true_false"),
    ).toEqual(trueFalseQuestion);
  });

  it("recognizes only a boolean skip signal", () => {
    expect(isSkipSignal('```json\n{"skip": true}\n```')).toBe(true);
    expect(isSkipSignal('{"skip": "true"}')).toBe(false);
  });
});
