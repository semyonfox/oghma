"use client";

import { FC, Fragment, memo, useState } from "react";
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import type { Message, MessagePart } from "./chat-interface";
import ChatMarkdown from "./chat-markdown";
import { ToolCallPill } from "./tool-call-pill";
import useI18n from "@/lib/notes/hooks/use-i18n";

/**
 * Render an assistant message body. If structured `parts` are present, walk
 * them and render each typed segment with the right component (markdown for
 * text, ToolCallPill for tool indicators). Falls back to whole-message
 * markdown for legacy/draft messages that only carry `content`.
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
            <Fragment key={i}>
              <ChatMarkdown>{part.text}</ChatMarkdown>
            </Fragment>
          ) : part.type === "error" ? (
            <div
              key={i}
              className="my-1 rounded-radius-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-xs text-red-200"
            >
              {part.text}
            </div>
          ) : (
            <ToolCallPill key={i} label={part.label} />
          ),
        )}
      </>
    );
  }
  return <ChatMarkdown>{content}</ChatMarkdown>;
};

// relevance level from cosine distance
function relevanceLabel(
  distance: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): { label: string; color: string } {
  if (distance < 0.3) return { label: t("high"), color: "text-green-400" };
  if (distance < 0.5) return { label: t("medium"), color: "text-yellow-400" };
  return { label: t("low"), color: "text-text-tertiary" };
}

// collapsible thinking block — ChatGPT style
const ThinkingBlock: FC<{
  text: string;
  isStreaming?: boolean;
  duration?: number;
}> = ({ text, isStreaming = false, duration }) => {
  const { t = (key: string) => key } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const label = isStreaming
    ? t("Thinking…")
    : duration != null && duration > 0
      ? t("Thought for {duration}s", { duration })
      : t("Thought for a moment");

  return (
    <div className="border border-border-subtle rounded-radius-lg overflow-hidden bg-surface/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-subtle/40 transition-colors"
      >
        {isStreaming ? (
          <span className="w-3 h-3 border-2 border-text-tertiary/30 border-t-text-tertiary/70 rounded-full animate-spin flex-shrink-0" />
        ) : (
          <span className="text-primary-400/60 text-xs flex-shrink-0">◆</span>
        )}
        <span className="text-xs text-text-tertiary italic flex-1">{label}</span>
        <ChevronDownIcon
          className={`w-3 h-3 text-text-tertiary/60 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2.5 text-xs text-text-tertiary leading-relaxed border-t border-border-subtle italic whitespace-pre-wrap max-h-72 overflow-y-auto obsidian-scrollbar">
          {text}
        </div>
      )}
    </div>
  );
};

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
  <div className="flex items-center gap-1 px-1 py-0.5">
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
}> = ({ message: m }) => {
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

  const isThinkingStreaming =
    !!m.thinking && !m.content.trim() && !m.error && !m.partial;
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;

  return (
    <div className="group/msg space-y-2.5">
      {m.thinking && (
        <ThinkingBlock
          text={m.thinking}
          isStreaming={isThinkingStreaming}
          duration={m.thinkingDuration}
        />
      )}

      <div className="glass-card rounded-radius-xl rounded-bl-[4px] px-3 py-2.5 text-sm leading-relaxed text-text">
        {hasContent || (m.parts && m.parts.length > 0) ? (
          <AssistantBody parts={m.parts} content={m.content} />
        ) : !m.thinking ? (
          <TypingDots />
        ) : null}
      </div>

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
        {hasContent && (
          <span className="opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100">
            <CopyMessageButton content={m.content} />
          </span>
        )}
      </div>
    </div>
  );
};

export const FullMessageBubble = memo(FullMessageBubbleComponent);

// compact message bubble (sidebar variant)
const CompactMessageBubbleComponent: FC<{ message: Message }> = ({
  message: m,
}) => {
  const isThinkingStreaming =
    !!m.thinking && !m.content.trim() && !m.error && !m.partial;
  const hasContent = m.content.trim().length > 0;
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;

  return (
    <div
      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div className="group/msg min-w-0 max-w-[90%] space-y-1.5">
        {m.role === "assistant" && m.thinking && (
          <ThinkingBlock
            text={m.thinking}
            isStreaming={isThinkingStreaming}
            duration={m.thinkingDuration}
          />
        )}

        <div
          className={`px-2 py-[5px] rounded-radius-md text-xs leading-relaxed ${
            m.role === "user"
              ? "border border-primary-500/25 bg-primary-500/10 text-text rounded-br-[4px]"
              : "bg-surface border border-border-subtle text-text-secondary rounded-bl-[4px]"
          }`}
        >
          {m.role === "assistant" ? (
            hasContent || (m.parts && m.parts.length > 0) ? (
              <AssistantBody parts={m.parts} content={m.content} />
            ) : (
              <TypingDots />
            )
          ) : (
            <ChatMarkdown>{m.content}</ChatMarkdown>
          )}
        </div>

        {hasContent && (
          <div
            className={`flex opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <CopyMessageButton content={m.content} />
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
