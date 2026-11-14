"use client";

import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import QuizMarkdown from "./quiz-markdown";
import QuizAssist from "./quiz-assist";

interface RelatedChunk {
  text: string;
  title: string | null;
}

function isRelatedChunk(value: unknown): value is RelatedChunk {
  if (value === null || typeof value !== "object") return false;
  const { text, title } = value as Record<string, unknown>;
  return typeof text === "string" && (title === null || typeof title === "string");
}

interface FeedbackProps {
  wasCorrect: boolean;
  explanation: string;
  correctAnswer: string;
  questionId?: string;
}

export default function Feedback({
  wasCorrect,
  explanation,
  correctAnswer,
  questionId,
}: FeedbackProps) {
  const { t } = useI18n();
  const [related, setRelated] = useState<RelatedChunk[]>([]);

  useEffect(() => {
    if (!questionId) return;
    const controller = new AbortController();
    fetch(`/api/quiz/questions/${questionId}/related`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { related?: unknown } | null) => {
        if (Array.isArray(data?.related)) {
          setRelated(data.related.filter(isRelatedChunk));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [questionId]);

  return (
    <div className="rounded-radius-xl border border-border bg-surface p-4 sm:p-5">
      <div
        className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${wasCorrect ? "text-success-700 dark:text-success-400" : "text-error-700 dark:text-error-400"}`}
      >
        {wasCorrect ? (
          <CheckIcon aria-hidden="true" className="h-4 w-4" />
        ) : (
          <XMarkIcon aria-hidden="true" className="h-4 w-4" />
        )}
        {wasCorrect ? t("quiz.feedback.correct") : t("quiz.feedback.incorrect")}
      </div>
      {!wasCorrect && (
        <div className="mb-3 text-sm text-text-secondary">
          {t("quiz.feedback.correct_answer")}{" "}
          <span className="font-medium text-text">{correctAnswer}</span>
        </div>
      )}

      {explanation && (
        <div className="font-serif text-base leading-relaxed text-text-secondary">
          <QuizMarkdown>{explanation}</QuizMarkdown>
        </div>
      )}

      {questionId && (
        <div className="mt-4">
          <QuizAssist questionId={questionId} modes={["simpler", "example"]} />
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-tertiary">
              {t("quiz.feedback.related_notes")}
            </span>
            {related.map((chunk, i) => (
              <span
                key={i}
                title={chunk.title ?? undefined}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent-soft-text"
              >
                <span className="truncate">
                  {chunk.title ?? t("quiz.feedback.related_notes")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
