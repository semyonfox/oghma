import { describe, expect, it } from "vitest";
import { gradeAnswer, isFillAnswerCorrect } from "@/lib/quiz/grade";

const acceptedAnswers: ReadonlyArray<readonly [string, string | string[]]> = [
  ["  PHOTOSYNTHESIS  ", "photosynthesis"],
  ["cell\n membrane   transport", "cell membrane transport"],
  ["cafe au lait", "Café-au-lait!"],
  ["mitochondrion", "mitochondria | mitochondrion; power house"],
  ["power house", ["mitochondria", "powerhouse", "power house"]],
];

describe("fill-in answer grading", () => {
  it.each(acceptedAnswers)("accepts equivalent answer %#", (userAnswer, correctAnswer) => {
    expect(isFillAnswerCorrect(userAnswer, correctAnswer)).toBe(true);
  });

  it("keeps slash-containing terms as one answer", () => {
    expect(isFillAnswerCorrect("TCP/IP", "TCP/IP")).toBe(true);
    expect(isFillAnswerCorrect("TCP", "TCP/IP")).toBe(false);
  });

  it.each([
    ["C++", "C"],
    ["C#", "C"],
    ["Na+", "Na"],
  ])("keeps meaning-bearing symbols in %s", (userAnswer, correctAnswer) => {
    expect(isFillAnswerCorrect(userAnswer, correctAnswer)).toBe(false);
  });

  it.each([
    [" --- ", "---"],
    ["mitosis", "meiosis"],
  ])("rejects a non-answer or different answer", (userAnswer, correctAnswer) => {
    expect(isFillAnswerCorrect(userAnswer, correctAnswer)).toBe(false);
  });
});

describe("shared answer grading", () => {
  const trueFalse = {
    question_type: "true_false" as const,
    options: [
      { text: "True", is_correct: false },
      { text: "False", is_correct: true },
    ],
    // older questions sometimes stored an answer that disagreed with the flags
    correct_answer: "True",
  };

  it("grades choice answers by the chosen option, matching what the card shows", () => {
    expect(gradeAnswer(trueFalse, "False")).toBe(true);
    expect(gradeAnswer(trueFalse, "True")).toBe(false);
  });

  it("rejects a choice answer that is not one of the options", () => {
    expect(gradeAnswer(trueFalse, "Maybe")).toBe(false);
  });

  it("falls back to typed grading for a choice question without usable options", () => {
    const broken = { question_type: "mcq" as const, options: null, correct_answer: "Heap" };
    expect(gradeAnswer(broken, " heap ")).toBe(true);
  });

  it("does not apply fuzzy normalisation to choice answers", () => {
    const mcq = {
      question_type: "mcq" as const,
      options: [
        { text: "C++", is_correct: true },
        { text: "C", is_correct: false },
      ],
      correct_answer: "C++",
    };
    expect(gradeAnswer(mcq, "C")).toBe(false);
    expect(gradeAnswer(mcq, " C++ ")).toBe(true);
  });
});
