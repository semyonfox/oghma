"use client";

import { FC, memo, useState } from "react";
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import type { Message } from "./chat-interface";
import ChatMarkdown from "./chat-markdown";
import { WorkLog } from "./tool-call-pill";
import { partitionMessageParts } from "@/lib/chat/types";
import useI18n from "@/lib/notes/hooks/use-i18n";

/** Text keeps its position as later tools arrive. Only reasoning/tool groups collapse. */
const AssistantBody: FC<{
  message: Message;
  active: boolean;
  compact?: boolean;
}> = ({ message, active, compact = false }) => {
  const parts = message.parts?.length
    ? message.parts
    : message.content
      ? [{ type: "text" as const, text: message.content }]
      : [];
  const legacyThinking = parts.some((part) => part.type === "reasoning")
    ? undefined
    : message.thinking;
  const rows: React.ReactNode[] = [];
  if (legacyThinking)
    rows.push(
      <WorkLog
        key="legacy-thinking"
        parts={[]}
        thinking={legacyThinking}
        thinkingDuration={message.thinkingDuration}
        active={active && parts.length === 0}
      />,
    );
  for (let index = 0; index < parts.length;) {
    const part = parts[index];
    const key = index;
    if (part.type === "tool" || part.type === "reasoning") {
      const start = index;
      while (
        index < parts.length &&
        (parts[index].type === "tool" || parts[index].type === "reasoning")
      )
        index++;
      rows.push(
        <WorkLog
          key={key}
          parts={parts.slice(start, index)}
          active={active && index === parts.length}
        />,
      );
      continue;
    }
    rows.push(
      part.type === "text" ? (
        <div
          key={key}
          className={
            compact
              ? "rounded-radius-md rounded-bl-[4px] border border-border-subtle bg-surface px-2 py-[5px] text-base leading-relaxed text-text-secondary lg:text-sm"
              : "glass-card rounded-radius-xl rounded-bl-[4px] px-3 py-2.5 text-sm leading-relaxed text-text"
          }
        >
          <ChatMarkdown>{part.text}</ChatMarkdown>
        </div>
      ) : (
        <div
          key={key}
          className="my-1 rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-200"
        >
          {part.text}
        </div>
      ),
    );
    index++;
  }
  return (
    <>
      {rows}
      {active && !message.error && parts.length === 0 && !legacyThinking && (
        <TypingDots />
      )}
    </>
  );
};

function presentAssistantMessage(message: Message) {
  const structured = Boolean(message.parts?.length);
  const presentation = partitionMessageParts(message.parts);
  return {
    ...presentation,
    answer: structured ? presentation.answer : undefined,
    answerText: structured ? presentation.answerText : message.content,
    hasAnswer: structured
      ? presentation.answer.length > 0
      : message.content.trim().length > 0,
  };
}

// relevance level from cosine distance
function relevanceLabel(
  distance: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): { label: string; color: string } {
  if (distance < 0.3) return { label: t("high"), color: "text-green-400" };
  if (distance < 0.5) return { label: t("medium"), color: "text-yellow-400" };
  return { label: t("low"), color: "text-text-tertiary" };
}

// collapsible sources block — clean list, full note titles
const SourcesBlock: FC<{
  sources: { id: string; title: string }[];
  retrieval?: Message["retrieval"];
}> = ({ sources, retrieval }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;

  // build relevance map from retrieval data
  const relMap = new Map<string, number>();
  if (retrieval) {
    for (const f of retrieval.usedFiles) relMap.set(f.id, 0.1);
    for (const f of retrieval.semanticHits) {
      if (!relMap.has(f.id)) relMap.set(f.id, 0.4);
    }
  }

  const count = sources.length;

  return (
    <div className="border border-border-subtle rounded-radius-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between bg-surface/50 px-3 py-2 text-left transition-colors hover:bg-subtle/50 lg:min-h-0"
      >
        <span className="text-xs text-text-tertiary">
          <span className="font-medium text-text-secondary">
            {t(count === 1 ? "{count} source" : "{count} sources", {
              count,
            })}
          </span>{" "}
          {t("used")}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-text-tertiary flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border-subtle">
          {sources.map((s) => {
            const distance = relMap.get(s.id);
            const rel = distance != null ? relevanceLabel(distance, t) : null;
            return (
              <a
                key={s.id}
                href={`/notes/${s.id}`}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-subtle/50 transition-colors border-b border-border-subtle last:border-b-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-border-subtle flex-shrink-0" />
                <span className="flex-1 text-xs text-text-secondary truncate">
                  {s.title || t("Untitled")}
                </span>
                {rel && (
                  <span className={`text-xs ${rel.color} flex-shrink-0`}>
                    {rel.label}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

// typing animation dots — shown while waiting for first token
export const TypingDots: FC = () => (
  <div
    className="flex items-center gap-1 px-1 py-0.5"
    role="status"
    aria-label="Working"
  >
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </div>
);

// The parent places this plain copy icon in a slot that appears on hover.
// On success, a Sonner toast shows "Copied" for 1.2 seconds. The icon does not change.
// This makes the action feel dispatched instead of changing the interface.
// Disable it briefly so a double-click does not show two toasts.
const CopyMessageButton: FC<{ content: string }> = ({ content }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    if (busy || !content.trim() || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("Copied"), { duration: 1200 });
    } catch {
      toast.error(t("Couldn't copy"));
    } finally {
      setBusy(true);
      window.setTimeout(() => setBusy(false), 1200);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={busy}
      className="touch-target-44 inline-flex items-center justify-center rounded-radius-sm text-text-tertiary opacity-70 transition-colors hover:opacity-100 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40 disabled:cursor-default"
      aria-label={t("Copy message")}
      title={t("Copy message")}
    >
      <ClipboardDocumentIcon className="w-3 h-3" />
    </button>
  );
};

// full-page message bubble
const FullMessageBubbleComponent: FC<{
  message: Message;
  sessionId?: string | null;
  isStreaming?: boolean;
}> = ({ message: m, isStreaming = false }) => {
  const hasContent = m.content.trim().length > 0;

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="group/msg min-w-0 max-w-[90%]">
          <div className="rounded-radius-xl rounded-br-[4px] border border-primary-500/25 bg-primary-500/10 px-3 py-2.5 text-sm leading-relaxed text-text">
            <ChatMarkdown>{m.content}</ChatMarkdown>
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-text-tertiary">
            {hasContent && (
              <span className="opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-hover/msg:opacity-100 lg:focus-within:opacity-100 pointer-coarse:opacity-100">
                <CopyMessageButton content={m.content} />
              </span>
            )}
            <p className="opacity-50" suppressHydrationWarning>
              {new Date(m.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const presentation = presentAssistantMessage(m);
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;
  const hasPartError = m.parts?.some((part) => part.type === "error");

  return (
    <div className="group/msg space-y-2.5">
      <AssistantBody message={m} active={isStreaming} />

      {m.error && !hasPartError && (
        <div className="rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-200">
          {m.error}
        </div>
      )}

      {hasSources && (
        <SourcesBlock sources={m.sources!} retrieval={m.retrieval} />
      )}

      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <p className="opacity-50" suppressHydrationWarning>
          {new Date(m.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {presentation.answerText.trim() && (
          <span className="opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-hover/msg:opacity-100 lg:focus-within:opacity-100 pointer-coarse:opacity-100">
            <CopyMessageButton content={presentation.answerText} />
          </span>
        )}
      </div>
    </div>
  );
};

export const FullMessageBubble = memo(FullMessageBubbleComponent);

// compact message bubble (sidebar variant)
const CompactMessageBubbleComponent: FC<{
  message: Message;
  isStreaming?: boolean;
}> = ({ message: m, isStreaming = false }) => {
  const presentation =
    m.role === "assistant" ? presentAssistantMessage(m) : null;
  const hasContent =
    m.role === "assistant"
      ? Boolean(presentation?.answerText.trim())
      : m.content.trim().length > 0;
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;
  const hasPartError = m.parts?.some((part) => part.type === "error");

  return (
    <div
      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div className="group/msg min-w-0 max-w-[90%] space-y-1.5">
        {m.role === "assistant" ? (
          <AssistantBody message={m} active={isStreaming} compact />
        ) : (
          <div className="rounded-radius-md rounded-br-[4px] border border-primary-500/25 bg-primary-500/10 px-2 py-[5px] text-base leading-relaxed text-text lg:text-sm">
            <ChatMarkdown>{m.content}</ChatMarkdown>
          </div>
        )}

        {m.role === "assistant" && m.error && !hasPartError && (
          <div className="rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-200">
            {m.error}
          </div>
        )}

        {hasContent && (
          <div
            className={`flex opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-hover/msg:opacity-100 lg:focus-within:opacity-100 pointer-coarse:opacity-100 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <CopyMessageButton
              content={presentation?.answerText ?? m.content}
            />
          </div>
        )}

        {m.role === "assistant" && hasSources && (
          <SourcesBlock sources={m.sources!} retrieval={m.retrieval} />
        )}
      </div>
    </div>
  );
};

export const CompactMessageBubble = memo(CompactMessageBubbleComponent);
