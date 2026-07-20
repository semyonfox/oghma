"use client";

import { type FC } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { SUGGESTED_APP_HELP_PROMPTS } from "@/lib/chat/app-guide";
import useI18n from "@/lib/notes/hooks/use-i18n";

const ChatSplash: FC<{ onSelectPrompt?: (prompt: string) => void }> = ({
  onSelectPrompt,
}) => {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-xl rounded-radius-lg border border-border-subtle bg-surface/40 px-3 py-2.5 text-left shadow-none">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-lg border border-primary-500/20 bg-primary-500/10">
          <SparklesIcon className="h-4 w-4 text-primary-400" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold text-text-secondary">
            OghmaNotes AI
          </h2>
          <p className="max-w-md text-xs leading-relaxed text-text-tertiary">
            {t("Ask anything about your notes, or start a conversation.")}
          </p>
          {onSelectPrompt && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {SUGGESTED_APP_HELP_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSelectPrompt(t(prompt))}
                  className="rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-left text-[11px] leading-snug text-text-tertiary transition-colors hover:border-primary-500/30 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
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
