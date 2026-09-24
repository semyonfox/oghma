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
  const runningTool = tools.findLast((tool) => tool.status === "running");

  if (!thinking && parts.length === 0) return null;

  const hasNarration = parts.some(
    (part) => part.type === "text" || part.type === "reasoning",
  );
  const summary =
    active && !hasAnswer
      ? runningTool?.label || (thinking ? t("Thinking") : t("Working…"))
      : tools.length > 0
        ? t(tools.length === 1 ? "1 step" : "{count} steps", {
            count: tools.length,
          })
        : hasNarration || thinking
          ? t("Thinking")
          : t("Work log");
  const workLogLabel = `${t("Work log")}: ${summary}`;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 rounded-radius-md px-3 py-2 text-left transition-colors hover:bg-subtle/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-500/50 lg:min-h-0"
        aria-label={workLogLabel}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() => {
          setExpanded((current) => !current);
        }}
      >
        {active && !hasAnswer ? (
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary-500/25 border-t-primary-500/75 motion-reduce:animate-none"
          />
        ) : (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/55"
          />
        )}
        <span
          aria-live={active && !hasAnswer ? "polite" : undefined}
          aria-atomic="true"
          className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary"
        >
          {summary}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div
          id={panelId}
          className="ml-5 space-y-1 rounded-radius-md bg-subtle/35 px-3 py-2.5"
        >
          {thinking && (
            <div className="mb-1.5 border-l-2 border-primary-500/20 pl-2.5">
              <p className="mb-0.5 text-xs font-medium text-text-tertiary">
                {thinkingDuration && thinkingDuration > 0
                  ? t("Thought for {duration}s", { duration: thinkingDuration })
                  : t("Thinking")}
              </p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-text-secondary obsidian-scrollbar">
                {thinking}
              </p>
            </div>
          )}

          {parts.map((part, index) =>
            part.type === "tool" ? (
              <div
                key={`${part.callId ?? part.name}-${index}`}
                className="flex items-start gap-2 py-1 text-sm leading-relaxed text-text-secondary"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${part.status === "failed" || part.status === "interrupted" ? "bg-red-400" : part.status === "running" && active ? "animate-pulse bg-primary-500" : "bg-primary-500/40"}`}
                />
                <span className="min-w-0">
                  <span className="font-medium text-text-secondary">{part.label}</span>
                  {part.status === "running" && active && (
                    <span className="ml-1 text-text-tertiary">· {t("Working…")}</span>
                  )}
                  {part.status === "failed" && (
                    <span className="ml-1 text-red-700 dark:text-red-300">{t("Failed")}</span>
                  )}
                  {part.detail &&
                    (part.name !== "readNote" || !part.resultDetail) && (
                      <span className="ml-1 break-words text-text-tertiary">
                        · {part.detail}
                      </span>
                    )}
                  {part.resultDetail && (
                    <span className="block break-words text-text-tertiary">
                      {part.resultDetail}
                    </span>
                  )}
                </span>
              </div>
            ) : part.type === "reasoning" ? (
              <div
                key={`reasoning-${index}`}
                className="border-l-2 border-primary-500/20 py-1 pl-2.5"
              >
                <p className="mb-0.5 text-xs font-medium text-text-tertiary">
                  {t("Thinking")}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {part.text}
                </p>
              </div>
            ) : part.type === "text" ? (
              <p
                key={`narration-${index}`}
                className="border-l-2 border-border-subtle py-1 pl-2.5 text-sm leading-relaxed text-text-tertiary"
              >
                {part.text}
              </p>
            ) : (
              <p key={`error-${index}`} className="py-1 text-xs leading-relaxed text-red-700 dark:text-red-300">
                {part.text}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
};
