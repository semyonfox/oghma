import { describe, expect, it } from "vitest";
import { isFillAnswerCorrect } from "@/lib/quiz/fill-answer";

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
