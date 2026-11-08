"use client";

import { useState, useEffect, useEffectEvent } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { BLOOM_NAMES } from "@/lib/quiz/types";
import type { QuizSessionQuestion } from "@/lib/quiz/types";
import { answersByTyping, gradeAnswer } from "@/lib/quiz/grade";
import { CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import QuizMarkdown from "./quiz-markdown";

interface QuestionCardProps {
  question: Pick<
    QuizSessionQuestion,
    | "question_text"
    | "question_type"
    | "bloom_level"
    | "options"
    | "correct_answer"
  >;
  moduleName?: string;
  onAnswer: (answer: string, wasCorrect: boolean) => void;
}

function QuizOptionText({ children }: { children: string }) {
  return <span className="whitespace-pre-wrap break-words">{children}</span>;
}

export default function QuestionCard({
  question,
  moduleName,
  onAnswer,
}: QuestionCardProps) {
  const { t } = useI18n();
  const options = (Array.isArray(question.options) ? question.options : []);
  // a choice question whose options could not be read is answered by typing
  const typed = answersByTyping(question);
  const hasOptions = !typed;
  const [selected, setSelected] = useState<number | null>(null);
  const [fillInAnswer, setFillInAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleMCQSelect = (index: number) => {
    if (submitted) return;
    setSelected(index);
  };

  const handleSubmit = () => {
    if (submitted) return;
    const answer = typed
      ? fillInAnswer
      : selected !== null
        ? options[selected]?.text
        : undefined;
    if (answer === undefined || !answer.trim()) return;

    setSubmitted(true);
    onAnswer(answer, gradeAnswer(question, answer));
  };

  // keyboard shortcuts for MCQ selection and submission
  const submitFromKeyboard = useEffectEvent(handleSubmit);
  useEffect(() => {
    if (submitted) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // only bare single characters pick options; otherwise keys like
      // Backspace or Cmd+C would select B or C
      const isOptionKey =
        e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (hasOptions && isOptionKey) {
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= options.length) {
          e.preventDefault();
          setSelected(numKey - 1);
          return;
        }
        const letterIdx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx < options.length) {
          e.preventDefault();
          setSelected(letterIdx);
          return;
        }
      }
      if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        submitFromKeyboard();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, hasOptions, options.length, selected]);

  return (
    <div className="flex-1 flex flex-col justify-center gap-5">
      {/* tags */}
      <div className="flex gap-2 items-center">
        <span className="rounded-full bg-subtle-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {BLOOM_NAMES[question.bloom_level]}
        </span>
        {moduleName && (
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text-secondary">
            {moduleName}
          </span>
        )}
      </div>

      {/* question text */}
      <div className="font-serif text-xl font-semibold leading-snug tracking-tight text-text sm:text-2xl">
        <QuizMarkdown>{question.question_text}</QuizMarkdown>
      </div>

      {/* MCQ / True-False options */}
      {hasOptions && (
        <div className="flex flex-col gap-2">
          {options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            const isCorrect = submitted && option.is_correct;
            const isWrongPick =
              submitted && i === selected && !option.is_correct;
            const isPicked = !submitted && i === selected;

            const cardClass = isCorrect
              ? "border-success-700 bg-success-50 ring-1 ring-success-700 dark:border-success-400 dark:bg-success-500/10 dark:ring-success-400"
              : isWrongPick
                ? "border-error-700 bg-error-50 ring-1 ring-error-700 dark:border-error-400 dark:bg-error-500/10 dark:ring-error-400"
                : isPicked
                  ? "atlas-raised ring-1 ring-border-strong"
                  : `border-border bg-surface ${!submitted ? "hover:bg-subtle cursor-pointer" : ""}`;

            const markerClass = isCorrect
              ? "border-transparent bg-success-700 text-on-action dark:bg-success-400"
              : isWrongPick
                ? "border-transparent bg-error-700 text-on-action dark:bg-error-400"
                : isPicked
                  ? "border-border-strong bg-subtle-hover text-text"
                  : "border-border text-text-tertiary";

            return (
              <button
                key={i}
                onClick={() => handleMCQSelect(i)}
                disabled={submitted}
                className={`flex min-h-12 items-center gap-3 rounded-radius-lg border px-4 py-3 text-left text-sm transition-colors ${cardClass}`}
              >
                <div
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-mono text-xs ${markerClass}`}
                >
                  {isCorrect ? (
                    <CheckIcon aria-hidden="true" className="h-4 w-4" />
                  ) : isWrongPick ? (
                    <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    letter
                  )}
                </div>
                <span
                  className={
                    isCorrect
                      ? "font-medium text-text"
                      : isWrongPick
                        ? "text-text-secondary line-through"
                        : isPicked
                          ? "font-medium text-text"
                          : "text-text-secondary"
                  }
                >
                  <QuizOptionText>{option.text}</QuizOptionText>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fill-in-the-blank */}
      {typed && (
        <div className="flex gap-2">
          <input
            type="text"
            value={fillInAnswer}
            onChange={(e) => setFillInAnswer(e.target.value)}
            disabled={submitted}
            placeholder={t("quiz.question.type_answer")}
            className="flex-1 rounded-radius-lg border border-border bg-input px-4 py-3 text-base text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 sm:text-sm"
            onKeyDown={(e) =>
              e.key === "Enter" &&
              !submitted &&
              fillInAnswer.trim() &&
              handleSubmit()
            }
          />
        </div>
      )}

      {/* submit button */}
      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={typed ? !fillInAnswer.trim() : selected === null}
          className="min-h-11 self-end rounded-radius-lg bg-action px-6 py-2.5 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("quiz.question.check_answer")}
        </button>
      )}
    </div>
  );
}
