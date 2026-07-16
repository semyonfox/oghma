"use client";

import { FC, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

/**
 * Inline indicator for a tool call within an assistant message. Sits between
 * text parts and survives reload via the persisted MessagePart array. Styling
 * mirrors the muted-italic register used by ThinkingBlock so tool actions
 * read as "the model paused to do something" without competing with prose.
 */
export const ToolActivity: FC<{
  tools: { name: string; label: string; detail?: string }[];
  active?: boolean;
}> = ({ tools, active = false }) => {
  const { t = (key: string) => key } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) return null;

  const summary = active
    ? tools[tools.length - 1].label
    : tools.length === 1
      ? tools[0].label
      : t("{count} actions", { count: tools.length });
  const expandable = active || tools.length > 1 || tools.some((tool) => tool.detail);
  const icon = active ? (
    <span className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary/70" />
  ) : (
    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500/50" />
  );

  return (
    <div className="my-2 overflow-hidden rounded-radius-lg border border-border-subtle bg-surface/30">
      {expandable ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-subtle/40"
          aria-expanded={expanded}
        >
          {icon}
          <span className="flex-1 text-xs italic text-text-tertiary" role={active ? "status" : undefined}>
            {summary}
          </span>
          <ChevronDownIcon
            className={`h-3 w-3 flex-shrink-0 text-text-tertiary/60 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2" role="status">
          {icon}
          <span className="text-xs italic text-text-tertiary">{summary}</span>
        </div>
      )}
      {expandable && expanded && (
        <div className="border-t border-border-subtle px-3 py-1.5">
          {tools.map((tool, index) => (
            <div key={`${tool.name}-${index}`} className="flex items-center gap-2.5 py-1">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border-subtle" />
              <span className="min-w-0 text-xs text-text-tertiary">
                <span>{tool.label}</span>
                {tool.detail && (
                  <span className="ml-1 text-text-secondary break-words">· {tool.detail}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
