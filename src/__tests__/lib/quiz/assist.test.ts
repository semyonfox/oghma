import { describe, expect, it } from "vitest";
import { buildQuizAssistPrompt, hintRevealsAnswer, type QuizAssistQuestion } from "@/lib/quiz/assist";

const mcq: QuizAssistQuestion = {
  question_text: "Which organelle produces most of the cell's ATP?",
  question_type: "mcq",
  options: [
    { text: "Ribosome", is_correct: false },
    { text: "Mitochondrion", is_correct: true },
  ],
  correct_answer: "Mitochondrion",
  explanation: "Oxidative phosphorylation happens in the mitochondrion.",
};

describe("quiz assist prompts", () => {
  it("keeps the answer and explanation out of the hint prompt", () => {
    const prompt = buildQuizAssistPrompt("hint", { ...mcq, options: null }, null);
    expect(prompt).not.toMatch(/mitochondrion/i);
    expect(prompt).not.toMatch(/oxidative/i);
  });

  it("gives the answer to the explain prompts", () => {
    expect(buildQuizAssistPrompt("simpler", mcq, null)).toContain("Correct answer: Mitochondrion");
  });
});

describe("hint answer leak guard", () => {
  it("rejects a hint that names the answer or an accepted alternative", () => {
    expect(hintRevealsAnswer("Think about the **mitochondrion**.", mcq)).toBe(true);
    const fill = { ...mcq, question_type: "fill_in" as const, options: null, correct_answer: "mitochondria | powerhouse" };
    expect(hintRevealsAnswer("It's often called the powerhouse of the cell", fill)).toBe(true);
  });

  it("accepts hints that only point at the concept", () => {
    expect(hintRevealsAnswer("Which organelle has its own DNA and a folded inner membrane?", mcq)).toBe(false);
    const tf = { ...mcq, question_type: "true_false" as const, correct_answer: "True" };
    expect(hintRevealsAnswer("Is it true that ATP is made in one place only?", tf)).toBe(false);
  });
});
