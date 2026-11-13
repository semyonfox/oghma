"use client";

import { useEffect, useRef, useState } from "react";
import { LightBulbIcon, SparklesIcon } from "@heroicons/react/20/solid";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { QuizAssistMode } from "@/lib/quiz/assist";
import QuizMarkdown from "./quiz-markdown";

type AssistState =
  | { status: "idle" }
  | { status: "loading"; mode: QuizAssistMode }
  | { status: "done"; mode: QuizAssistMode; text: string }
  | { status: "failed"; mode: QuizAssistMode };

const LABEL_KEYS: Record<QuizAssistMode, string> = {
  hint: "quiz.assist.hint",
  simpler: "quiz.assist.simpler",
  example: "quiz.assist.example",
};

interface QuizAssistProps {
  questionId: string;
  modes: readonly QuizAssistMode[];
}

// optional help that never blocks the quiz: a slow or failed reply only
// changes this block, and answering or moving on aborts it
export default function QuizAssist({ questionId, modes }: QuizAssistProps) {
  const { t } = useI18n();
  const [state, setState] = useState<AssistState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const request = async (mode: QuizAssistMode) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", mode });
    try {
      const response = await fetch(`/api/quiz/questions/${questionId}/assist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
        signal: controller.signal,
      });
      const data: unknown = response.ok ? await response.json() : null;
      const text = data && typeof data === "object" ? Reflect.get(data, "text") : null;
      if (controller.signal.aborted) return;
      setState(
        typeof text === "string" && text.trim()
          ? { status: "done", mode, text }
          : { status: "failed", mode },
      );
    } catch {
      if (!controller.signal.aborted) setState({ status: "failed", mode });
    }
  };

  const busy = state.status === "loading";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => {
          const Icon = mode === "hint" ? LightBulbIcon : SparklesIcon;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => void request(mode)}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-radius-md border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-subtle hover:text-text disabled:cursor-wait disabled:opacity-60"
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {t(LABEL_KEYS[mode])}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {state.status === "loading" && (
          <p className="text-sm text-text-tertiary">{t("quiz.assist.loading")}</p>
        )}
        {state.status === "failed" && (
          <p className="text-sm text-text-secondary">{t("quiz.assist.failed")}</p>
        )}
        {state.status === "done" && (
          <div className="rounded-radius-lg bg-surface-elevated px-4 py-3 text-base leading-relaxed text-text-secondary">
            <QuizMarkdown>{state.text}</QuizMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
