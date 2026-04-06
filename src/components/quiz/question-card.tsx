"use client";

import { useState, useEffect, useCallback } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { BLOOM_NAMES } from "@/lib/quiz/types";
import type { BloomLevel } from "@/lib/quiz/types";

interface QuestionCardProps {
  question: {
    question_text: string;
    question_type: string;
    bloom_level: BloomLevel;
    options: { text: string; is_correct: boolean }[] | null;
    correct_answer: string;
  };
  moduleName?: string;
  onAnswer: (answer: string, wasCorrect: boolean) => void;
}

export default function QuestionCard({
  question,
  moduleName,
  onAnswer,
}: QuestionCardProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const [fillInAnswer, setFillInAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleMCQSelect = (index: number) => {
    if (submitted) return;
    setSelected(index);
  };

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);

    if (question.question_type === "fill_in") {
      const correct =
        fillInAnswer.trim().toLowerCase() ===
        question.correct_answer.trim().toLowerCase();
      onAnswer(fillInAnswer, correct);
    } else if (selected !== null && question.options) {
      const isCorrect = question.options[selected].is_correct;
      onAnswer(question.options[selected].text, isCorrect);
    }
  }, [submitted, question, fillInAnswer, selected, onAnswer]);

  // keyboard shortcuts for MCQ selection and submission
  useEffect(() => {
    if (submitted) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (question.options) {
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= question.options.length) {
          e.preventDefault();
          setSelected(numKey - 1);
          return;
        }
        const letterIdx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx < question.options.length) {
          e.preventDefault();
          setSelected(letterIdx);
          return;
        }
      }
      if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, question.options, selected, handleSubmit]);

  return (
    <div className="flex-1 flex flex-col justify-center gap-5">
      {/* tags */}
      <div className="flex gap-2 items-center">
        <span className="bg-surface-elevated text-text-tertiary px-2.5 py-0.5 rounded-radius-sm text-xs font-medium">
          {BLOOM_NAMES[question.bloom_level]}
        </span>
        {moduleName && (
          <span className="bg-surface-elevated text-text-tertiary px-2.5 py-0.5 rounded-radius-sm text-xs">
            {moduleName}
          </span>
        )}
      </div>

      {/* question text */}
      <h2 className="text-text text-lg font-medium leading-relaxed">
        {question.question_text}
      </h2>

      {/* MCQ / True-False options */}
      {question.options && (
        <div className="flex flex-col gap-2">
          {question.options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            let borderColor = "border-border-subtle";
            let bgColor = "bg-surface";

            if (submitted) {
              if (option.is_correct) {
                borderColor = "border-success-500/20";
                bgColor = "bg-success-500/3";
              } else if (i === selected && !option.is_correct) {
                borderColor = "border-error-500/20";
                bgColor = "bg-error-500/3";
              }
            } else if (i === selected) {
              borderColor = "border-text-tertiary";
              bgColor = "bg-primary-500/10";
            }

            return (
              <button
                key={i}
                onClick={() => handleMCQSelect(i)}
                disabled={submitted}
                className={`${bgColor} border ${borderColor} rounded-radius-lg px-4 py-3 text-sm text-left flex items-center gap-3 transition-colors ${!submitted ? "hover:border-text-tertiary cursor-pointer" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${
                    i === selected
                      ? submitted
                        ? option.is_correct
                          ? "bg-success-500/20 border-success-500/30 text-text-secondary"
                          : "bg-error-500/20 border-error-500/30 text-text-secondary"
                        : "bg-white/10 border-text-tertiary text-text-secondary"
                      : submitted && option.is_correct
                        ? "bg-success-500/20 border-success-500/30 text-text-secondary"
                        : "border-border-subtle text-text-tertiary"
                  }`}
                >
                  {letter}
                </div>
                <span
                  className={
                    submitted && option.is_correct
                      ? "text-text"
                      : i === selected && submitted && !option.is_correct
                        ? "text-text-tertiary line-through"
                        : "text-text-secondary"
                  }
                >
                  {option.text}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fill-in-the-blank */}
      {question.question_type === "fill_in" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={fillInAnswer}
            onChange={(e) => setFillInAnswer(e.target.value)}
            disabled={submitted}
            placeholder={t("quiz.question.type_answer")}
            className="flex-1 bg-surface border border-border-subtle rounded-radius-lg px-4 py-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50"
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
          disabled={
            (question.options && selected === null) ||
            (question.question_type === "fill_in" && !fillInAnswer.trim())
          }
          className="glass-card-interactive text-text px-6 py-2.5 rounded-radius-lg text-sm font-medium self-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("quiz.question.check_answer")}
        </button>
      )}
    </div>
  );
}
