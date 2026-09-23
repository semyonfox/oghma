"use client";

import { FC, useId, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { MessagePart } from "@/lib/chat/types";

/** A consecutive reasoning/tool group in the ordered response timeline. */
export const WorkLog: FC<{
  parts: MessagePart[];
  thinking?: string;
  thinkingDuration?: number;
  active?: boolean;
  hasAnswer?: boolean;
}> = ({
  parts,
  thinking,
  thinkingDuration,
  active = false,
  hasAnswer = false,
}) => {
  const { t } = useI18n();
  const panelId = useId();
  const [expanded, setExpanded] = useState(active && !hasAnswer);
  const tools = parts.filter(
    (part): part is Extract<MessagePart, { type: "tool" }> =>
      part.type === "tool",
  );

  if (!thinking && parts.length === 0) return null;

  const hasNarration = parts.some(
    (part) => part.type === "text" || part.type === "reasoning",
  );
  const label =
    active && !hasAnswer
      ? t("Working…")
      : thinking || hasNarration
        ? t("Work log")
        : t(tools.length === 1 ? "1 action" : "{count} actions", {
            count: tools.length,
          });

  return (
    <div className="overflow-hidden rounded-radius-lg border border-border-subtle bg-surface/20">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-subtle/30 lg:min-h-0"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() => {
          setExpanded((current) => !current);
        }}
      >
        {active && !hasAnswer ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary/70" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/55" />
        )}
        <span className="flex-1 text-base font-medium lg:text-sm text-text-tertiary">
          {label}
        </span>
        {tools.length > 0 && (active || thinking || hasNarration) && (
          <span className="text-[11px] text-text-tertiary/60">
            {t(tools.length === 1 ? "1 action" : "{count} actions", {
              count: tools.length,
            })}
          </span>
        )}
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 text-text-tertiary/60 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div
          id={panelId}
          className="space-y-px border-t border-border-subtle px-3 py-2"
        >
          {thinking && (
            <div className="mb-1.5 border-l border-primary-500/25 pl-2.5">
              <p className="mb-1 text-[11px] font-medium text-text-tertiary/75">
                {thinkingDuration && thinkingDuration > 0
                  ? t("Thought for {duration}s", { duration: thinkingDuration })
                  : t("Thinking")}
              </p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-base italic leading-relaxed lg:text-sm text-text-tertiary obsidian-scrollbar">
                {thinking}
              </p>
            </div>
          )}

          {parts.map((part, index) =>
            part.type === "tool" ? (
              <div
                key={`${part.callId ?? part.name}-${index}`}
                className="flex items-start gap-2 py-1 text-base text-text-tertiary lg:text-sm"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${part.status === "failed" || part.status === "interrupted" ? "bg-red-400" : part.status === "running" && active ? "animate-pulse bg-primary-500" : "bg-primary-500/40"}`}
                />
                <span className="min-w-0">
                  <span>{part.label}</span>
                  {part.status === "completed" && (
                    <span className="ml-1 text-text-tertiary">· {t("Done")}</span>
                  )}
                  {part.status === "running" && active && (
                    <span className="ml-1">{t("Working…")}</span>
                  )}
                  {part.status === "failed" && (
                    <span className="ml-1 text-red-700 dark:text-red-300">{t("Failed")}</span>
                  )}
                  {part.detail &&
                    (part.name !== "readNote" || !part.resultDetail) && (
                      <span className="ml-1 break-words text-text-secondary">
                        · {part.detail}
                      </span>
                    )}
                  {part.resultDetail && (
                    <span className="block break-words text-text-secondary">
                      {part.resultDetail}
                    </span>
                  )}
                </span>
              </div>
            ) : part.type === "reasoning" ? (
              <div
                key={`reasoning-${index}`}
                className="border-l border-primary-500/25 py-1 pl-2.5"
              >
                <p className="mb-1 text-[11px] font-medium text-text-tertiary/75">
                  {t("Thinking")}
                </p>
                <p className="whitespace-pre-wrap text-base leading-relaxed text-text-tertiary lg:text-sm">
                  {part.text}
                </p>
              </div>
            ) : part.type === "text" ? (
              <p
                key={`narration-${index}`}
                className="border-l border-border-subtle py-1 pl-2.5 text-base italic leading-relaxed lg:text-sm text-text-tertiary"
              >
                {part.text}
              </p>
            ) : (
              <p key={`error-${index}`} className="py-1 text-xs text-red-700 dark:text-red-300">
                {part.text}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
};
