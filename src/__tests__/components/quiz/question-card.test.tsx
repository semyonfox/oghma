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
  it("submits a clicked MCQ choice once and keeps option Markdown literal", () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <QuestionCard question={mcqQuestion} onAnswer={onAnswer} />,
    );

    const submit = screen.getByRole("button", {
      name: "quiz.question.check_answer",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("## H2 Header").tagName).toBe("SPAN");
    expect(container.querySelector("h2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Correct answer/ }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("Correct answer", true);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledOnce();
  });

  it("selects and submits an MCQ choice from the keyboard", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={mcqQuestion} onAnswer={onAnswer} />);

    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "Enter" });

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
