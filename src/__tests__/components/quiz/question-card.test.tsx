// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/quiz/quiz-markdown", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));

import QuestionCard from "@/components/quiz/question-card";

type Question = ComponentProps<typeof QuestionCard>["question"];

const mcqQuestion: Question = {
  question_text: "Choose the correct answer",
  question_type: "mcq",
  bloom_level: 1,
  options: [
    { text: "## H2 Header", is_correct: false },
    { text: "Correct answer", is_correct: true },
  ],
  correct_answer: "Correct answer",
};

describe("QuestionCard", () => {
  it("reveals a basic card before accepting a self-rating", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={{ ...mcqQuestion, question_type: "basic", options: null }} onAnswer={onAnswer} />);
    expect(screen.queryByText("Correct answer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "cards.reveal" }));
    expect(screen.getByText("Correct answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "cards.hard" }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("", true, 2);
  });

  it("answers on the first click, once, and keeps option Markdown literal", () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <QuestionCard question={mcqQuestion} onAnswer={onAnswer} />,
    );

    expect(screen.getByText("## H2 Header").tagName).toBe("SPAN");
    expect(container.querySelector("h2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Correct answer/ }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("Correct answer", true);

    fireEvent.click(screen.getByRole("button", { name: /H2 Header/ }));
    fireEvent.keyDown(window, { key: "B" });
    expect(onAnswer).toHaveBeenCalledOnce();
  });

  it("answers an MCQ choice with one key press", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={mcqQuestion} onAnswer={onAnswer} />);

    fireEvent.keyDown(window, { key: "A" });

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("## H2 Header", false);
  });

  it("normalizes a fill-in answer submitted with Enter and cannot resubmit it", () => {
    const onAnswer = vi.fn();
    const question: Question = {
      question_text: "Name the drink",
      question_type: "fill_in",
      bloom_level: 2,
      options: null,
      correct_answer: "cafe au lait",
    };
    render(<QuestionCard question={question} onAnswer={onAnswer} />);
    const input = screen.getByPlaceholderText("quiz.question.type_answer");

    fireEvent.change(input, { target: { value: "  CAFÉ-au-lait!  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(
      "  CAFÉ-au-lait!  ",
      true,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledOnce();
  });
});
