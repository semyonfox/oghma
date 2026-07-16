"use client";

import { FC, useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { MessagePart } from "@/lib/chat/types";

/** A single, T3-style process region above the final assistant answer. */
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
  const { t = (key: string) => key } = useI18n();
  const panelId = useId();
  const [expanded, setExpanded] = useState(active && !hasAnswer);
  const manuallyToggledRef = useRef(false);
  const wasActiveRef = useRef(active);
  const tools = parts.filter(
    (part): part is Extract<MessagePart, { type: "tool" }> =>
      part.type === "tool",
  );

  useEffect(() => {
    if (hasAnswer && expanded && !manuallyToggledRef.current) {
      setExpanded(false);
    }
  }, [expanded, hasAnswer]);

  useEffect(() => {
    if (
      active &&
      !wasActiveRef.current &&
      !hasAnswer &&
      !manuallyToggledRef.current
    ) {
      setExpanded(true);
    }
    wasActiveRef.current = active;
  }, [active, hasAnswer]);

  if (!thinking && parts.length === 0) return null;

  const hasNarration = parts.some((part) => part.type === "text");
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
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-subtle/30"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() => {
          manuallyToggledRef.current = true;
          setExpanded((current) => !current);
        }}
      >
        {active && !hasAnswer ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary/70" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/55" />
        )}
        <span className="flex-1 text-xs font-medium text-text-tertiary">
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
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs italic leading-relaxed text-text-tertiary obsidian-scrollbar">
                {thinking}
              </p>
            </div>
          )}

          {parts.map((part, index) =>
            part.type === "tool" ? (
              <div
                key={`${part.callId ?? part.name}-${index}`}
                className="flex items-start gap-2 py-1 text-xs text-text-tertiary"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/40" />
                <span className="min-w-0">
                  <span>{part.label}</span>
                  {part.detail && (
                    <span className="ml-1 break-words text-text-secondary">
                      · {part.detail}
                    </span>
                  )}
                </span>
              </div>
            ) : part.type === "text" ? (
              <p
                key={`narration-${index}`}
                className="border-l border-border-subtle py-1 pl-2.5 text-xs italic leading-relaxed text-text-tertiary"
              >
                {part.text}
              </p>
            ) : (
              <p key={`error-${index}`} className="py-1 text-xs text-red-300">
                {part.text}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
};
