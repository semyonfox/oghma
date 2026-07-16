"use client";

import { FC, memo, useState } from "react";
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import type { Message, MessagePart } from "./chat-interface";
import ChatMarkdown from "./chat-markdown";
import { WorkLog } from "./tool-call-pill";
import { partitionMessageParts } from "@/lib/chat/types";
import useI18n from "@/lib/notes/hooks/use-i18n";

/**
 * Render only final-answer parts. Process narration and tools are handled by
 * WorkLog above this surface.
 */
const AssistantBody: FC<{ parts?: MessagePart[]; content: string }> = ({
  parts,
  content,
}) => {
  if (parts && parts.length > 0) {
    return (
      <>
        {parts.map((part, i) =>
          part.type === "text" ? (
            <div key={i}>
              <ChatMarkdown>{part.text}</ChatMarkdown>
            </div>
          ) : part.type === "error" ? (
            <div
              key={i}
              className="my-1 rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-200"
            >
              {part.text}
            </div>
          ) : null,
        )}
      </>
    );
  }
  return <ChatMarkdown>{content}</ChatMarkdown>;
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
  const { t = (key: string) => key } = useI18n();
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
        className="w-full flex items-center justify-between px-3 py-2 bg-surface/50 hover:bg-subtle/50 transition-colors text-left"
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

// chrome-less copy "icon" — placed inside a hover-revealed slot by the parent.
// success: a sonner toast pops "Copied" for 1.2s; the icon itself doesn't change,
// so the action feels like it dispatched somewhere rather than mutating the chrome.
// disabled briefly so double-click doesn't fire two toasts.
const CopyMessageButton: FC<{ content: string }> = ({ content }) => {
  const { t = (key: string) => key } = useI18n();
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
      className="inline-flex items-center rounded-radius-sm text-text-tertiary opacity-70 transition-colors hover:opacity-100 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40 disabled:cursor-default"
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
              <span className="opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100">
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
  const hasProcess = Boolean(m.thinking || presentation.activity.length > 0);
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;
  const hasPartError = m.parts?.some((part) => part.type === "error");

  return (
    <div className="group/msg space-y-2.5">
      {hasProcess && (
        <WorkLog
          parts={presentation.activity}
          thinking={m.thinking}
          thinkingDuration={m.thinkingDuration}
          active={isStreaming}
          hasAnswer={presentation.hasAnswer}
        />
      )}

      {(presentation.hasAnswer || (isStreaming && !m.error)) && (
        <div className="glass-card rounded-radius-xl rounded-bl-[4px] px-3 py-2.5 text-sm leading-relaxed text-text">
          {presentation.hasAnswer ? (
            <AssistantBody
              parts={presentation.answer}
              content={presentation.answerText}
            />
          ) : (
            <TypingDots />
          )}
        </div>
      )}

      {m.error && !hasPartError && (
        <div className="rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-200">
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
          <span className="opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100">
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
        {m.role === "assistant" &&
          presentation &&
          (m.thinking || presentation.activity.length > 0) && (
            <WorkLog
              parts={presentation.activity}
              thinking={m.thinking}
              thinkingDuration={m.thinkingDuration}
              active={isStreaming}
              hasAnswer={presentation.hasAnswer}
            />
          )}

        {(m.role === "user" ||
          presentation?.hasAnswer ||
          (isStreaming && !m.error)) && (
          <div
            className={`px-2 py-[5px] rounded-radius-md text-xs leading-relaxed ${
              m.role === "user"
                ? "border border-primary-500/25 bg-primary-500/10 text-text rounded-br-[4px]"
                : "bg-surface border border-border-subtle text-text-secondary rounded-bl-[4px]"
            }`}
          >
            {m.role === "assistant" ? (
              presentation?.hasAnswer ? (
                <AssistantBody
                  parts={presentation.answer}
                  content={presentation.answerText}
                />
              ) : (
                <TypingDots />
              )
            ) : (
              <ChatMarkdown>{m.content}</ChatMarkdown>
            )}
          </div>
        )}

        {m.role === "assistant" && m.error && !hasPartError && (
          <div className="rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-200">
            {m.error}
          </div>
        )}

        {hasContent && (
          <div
            className={`flex opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100 ${m.role === "user" ? "justify-end" : "justify-start"}`}
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
