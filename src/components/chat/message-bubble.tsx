"use client";

import { FC, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "./chat-interface";
import ChatMarkdown from "./chat-markdown";

// relevance level from cosine distance
function relevanceLabel(distance: number): { label: string; color: string } {
  if (distance < 0.3) return { label: "high", color: "text-green-400" };
  if (distance < 0.5) return { label: "medium", color: "text-yellow-400" };
  return { label: "low", color: "text-text-tertiary" };
}

// collapsible thinking block — ChatGPT style
const ThinkingBlock: FC<{
  text: string;
  isStreaming?: boolean;
  duration?: number;
}> = ({ text, isStreaming = false, duration }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const label = isStreaming
    ? "Thinking…"
    : duration != null && duration > 0
      ? `Thought for ${duration}s`
      : "Thought for a moment";

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-subtle/50 transition-colors"
      >
        {isStreaming ? (
          <span className="w-3.5 h-3.5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin flex-shrink-0" />
        ) : (
          <span className="text-text-tertiary text-xs flex-shrink-0">◆</span>
        )}
        <span className="text-sm text-text-tertiary italic">{label}</span>
        <ChevronDownIcon
          className={`w-3 h-3 text-text-tertiary ml-auto flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-2 text-sm text-text-tertiary leading-relaxed border-t border-border-subtle italic whitespace-pre-wrap max-h-72 overflow-y-auto">
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
    <div className="border border-border-subtle rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface/50 hover:bg-subtle/50 transition-colors text-left"
      >
        <span className="text-sm text-text-tertiary">
          <span className="font-medium text-text-secondary">
            {count} {count === 1 ? "source" : "sources"}
          </span>{" "}
          used
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-text-tertiary flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border-subtle">
          {sources.map((s) => {
            const distance = relMap.get(s.id);
            const rel = distance != null ? relevanceLabel(distance) : null;
            return (
              <a
                key={s.id}
                href={`/notes/${s.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-subtle/50 transition-colors border-b border-border-subtle last:border-b-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-border-subtle flex-shrink-0" />
                <span className="flex-1 text-sm text-text-secondary truncate">
                  {s.title || "Untitled"}
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

const CopyMessageButton: FC<{
  content: string;
  variant:
    | "full-user"
    | "full-assistant"
    | "compact-user"
    | "compact-assistant";
}> = ({ content, variant }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content.trim() || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const className =
    variant === "full-user"
      ? "absolute right-2 top-2 rounded-md p-1 text-text-on-primary/70 hover:bg-white/10 hover:text-text-on-primary transition-colors"
      : variant === "full-assistant"
        ? "absolute right-2 top-2 rounded-md p-1 text-text-tertiary hover:bg-subtle hover:text-text transition-colors"
        : variant === "compact-user"
          ? "absolute right-1.5 top-1.5 rounded p-1 text-text-on-primary/70 hover:bg-white/10 hover:text-text-on-primary transition-colors"
          : "absolute right-1.5 top-1.5 rounded p-1 text-text-tertiary hover:bg-subtle hover:text-text-secondary transition-colors";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label="Copy message"
      title={copied ? "Copied" : "Copy message"}
    >
      {copied ? (
        <CheckIcon className="w-3.5 h-3.5" />
      ) : (
        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      )}
    </button>
  );
};

// full-page message bubble
export const FullMessageBubble: FC<{
  message: Message;
  sessionId?: string | null;
}> = ({ message: m }) => {
  const hasContent = m.content.trim().length > 0;

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl">
          <div className="relative px-4 py-3 pr-12 rounded-2xl rounded-br-sm bg-primary-500/85 text-text-on-primary text-sm leading-relaxed">
            {hasContent && (
              <CopyMessageButton content={m.content} variant="full-user" />
            )}
            <p>{m.content}</p>
          </div>
          <p
            className="text-xs text-text-tertiary opacity-60 mt-1 text-right"
            suppressHydrationWarning
          >
            {new Date(m.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );
  }

  const isThinkingStreaming = !!m.thinking && !m.content.trim();
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;

  return (
    <div className="space-y-3">
      {m.thinking && (
        <ThinkingBlock
          text={m.thinking}
          isStreaming={isThinkingStreaming}
          duration={m.thinkingDuration}
        />
      )}

      <div className="glass-card relative rounded-2xl rounded-bl-sm px-4 py-3 pr-12 text-sm leading-relaxed text-text">
        {hasContent && (
          <CopyMessageButton content={m.content} variant="full-assistant" />
        )}
        {hasContent ? (
          <ChatMarkdown>{m.content}</ChatMarkdown>
        ) : !m.thinking ? (
          <TypingDots />
        ) : null}
      </div>

      {hasSources && (
        <SourcesBlock sources={m.sources!} retrieval={m.retrieval} />
      )}

      <p className="text-xs text-text-tertiary opacity-60" suppressHydrationWarning>
        {new Date(m.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
};

// compact message bubble (sidebar variant)
export const CompactMessageBubble: FC<{ message: Message }> = ({
  message: m,
}) => {
  const isThinkingStreaming = !!m.thinking && !m.content.trim();
  const hasContent = m.content.trim().length > 0;
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;

  return (
    <div
      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div className="max-w-[85%] space-y-1.5">
        {m.role === "assistant" && m.thinking && (
          <ThinkingBlock
            text={m.thinking}
            isStreaming={isThinkingStreaming}
            duration={m.thinkingDuration}
          />
        )}

        <div
          className={`relative px-2.5 py-1.5 pr-8 rounded-md text-xs leading-relaxed ${
            m.role === "user"
              ? "bg-primary-500/70 text-text-on-primary rounded-br-sm"
              : "bg-surface border border-border-subtle text-text-secondary rounded-bl-sm"
          }`}
        >
          {hasContent && (
            <CopyMessageButton
              content={m.content}
              variant={m.role === "user" ? "compact-user" : "compact-assistant"}
            />
          )}
          {m.role === "assistant" ? (
            hasContent ? (
              <ChatMarkdown>{m.content}</ChatMarkdown>
            ) : (
              <TypingDots />
            )
          ) : (
            m.content
          )}
        </div>

        {m.role === "assistant" && hasSources && (
          <SourcesBlock sources={m.sources!} retrieval={m.retrieval} />
        )}
      </div>
    </div>
  );
};
