"use client";

import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import QuizMarkdown from "./quiz-markdown";

interface RelatedChunk {
  text: string;
  title: string;
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
    fetch(`/api/quiz/questions/${questionId}/related`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.related)) setRelated(data.related);
      })
      .catch(() => {});
  }, [questionId]);

  return (
    <div
      className={`rounded-radius-lg p-4 border ${wasCorrect ? "bg-success-500/3 border-success-500/15" : "bg-error-500/3 border-error-500/15"}`}
    >
      <div className="text-sm font-medium mb-2 text-text-secondary">
        {wasCorrect ? t("quiz.feedback.correct") : t("quiz.feedback.incorrect")}
      </div>
      {!wasCorrect && (
        <div className="text-xs text-text-secondary mb-3">
          {t("quiz.feedback.correct_answer")}{" "}
          <span className="text-text font-medium">{correctAnswer}</span>
        </div>
      )}

      {explanation && (
        <div className="text-xs text-text-tertiary">
          <QuizMarkdown>{explanation}</QuizMarkdown>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border-subtle space-y-2">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
            {t("quiz.feedback.related_notes")}
          </div>
          {related.map((chunk, i) => (
            <div
              key={i}
              className="bg-surface rounded-radius-sm px-3 py-2 space-y-1"
            >
              <div className="text-xs text-text-tertiary font-medium">
                {chunk.title}
              </div>
              <div className="text-xs text-text-secondary leading-relaxed line-clamp-4">
                <QuizMarkdown>{chunk.text}</QuizMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
