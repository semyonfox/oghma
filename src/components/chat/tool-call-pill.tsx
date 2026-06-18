"use client";

import { FC } from "react";

/**
 * Inline indicator for a tool call within an assistant message. Sits between
 * text parts and survives reload via the persisted MessagePart array. Styling
 * mirrors the muted-italic register used by ThinkingBlock so tool actions
 * read as "the model paused to do something" without competing with prose.
 */
export const ToolCallPill: FC<{ label: string }> = ({ label }) => (
  <div
    className="my-2 inline-flex items-center gap-1.5 rounded-radius-md border border-border-subtle bg-surface/50 px-2 py-0.5 text-xs italic text-text-tertiary"
    role="status"
  >
    <span className="h-1.5 w-1.5 rounded-full bg-primary-500/50" />
    <span>{label}</span>
  </div>
);
