"use client";

import { type FC } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

const STUDY_PROMPTS = [
  "Summarise my notes",
  "Explain a difficult concept",
  "Help me plan a study session",
];

const ChatSplash: FC<{ onSelectPrompt?: (prompt: string) => void }> = ({
  onSelectPrompt,
}) => {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-xl px-2 py-8 text-left sm:rounded-radius-xl sm:border sm:border-border sm:bg-surface sm:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-lg bg-accent-soft">
          <SparklesIcon className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-text">
            OghmaNotes AI
          </h2>
          <p className="max-w-md text-base leading-relaxed text-text-secondary">
            {t("Ask anything about your notes, or start a conversation.")}
          </p>
          {onSelectPrompt && (
            <div className="grid gap-2 pt-3 sm:grid-cols-2">
              {STUDY_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSelectPrompt(t(prompt))}
                  className="min-h-11 rounded-full border border-border bg-surface px-3.5 py-2 text-left text-sm leading-snug text-text-secondary transition-colors hover:bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {t(prompt)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSplash;
