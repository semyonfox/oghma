"use client";

import { useState } from "react";
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

  const handleSubmit = () => {
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
  };

  return (
    <div className="flex-1 flex flex-col justify-center gap-5">
      {/* tags */}
      <div className="flex gap-2 items-center">
        <span className="bg-secondary-500/15 text-secondary-400 px-2.5 py-0.5 rounded text-[10px] font-medium">
          {BLOOM_NAMES[question.bloom_level]}
        </span>
        {moduleName && (
          <span className="bg-primary-500/15 text-primary-400 px-2.5 py-0.5 rounded text-[10px]">
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
                borderColor = "border-success-500";
                bgColor = "bg-success-500/5";
              } else if (i === selected && !option.is_correct) {
                borderColor = "border-error-500";
                bgColor = "bg-error-500/5";
              }
            } else if (i === selected) {
              borderColor = "border-secondary-500";
              bgColor = "bg-secondary-500/5";
            }

            return (
              <button
                key={i}
                onClick={() => handleMCQSelect(i)}
                disabled={submitted}
                className={`${bgColor} border ${borderColor} rounded-lg px-4 py-3 text-sm text-left flex items-center gap-3 transition-colors ${!submitted ? "hover:border-text-tertiary cursor-pointer" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${
                    i === selected
                      ? submitted
                        ? option.is_correct
                          ? "bg-success-500 border-success-500 text-white"
                          : "bg-error-500 border-error-500 text-white"
                        : "bg-secondary-500 border-secondary-500 text-white"
                      : submitted && option.is_correct
                        ? "bg-success-500 border-success-500 text-white"
                        : "border-text-tertiary text-text-tertiary"
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
            className="flex-1 bg-surface border border-border-subtle rounded-lg px-4 py-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-secondary-500"
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
          className="bg-secondary-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold self-center hover:bg-secondary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("quiz.question.check_answer")}
        </button>
      )}
    </div>
  );
}
