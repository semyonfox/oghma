"use client";

import { FC, useState } from "react";
import {
  ChevronDownIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
} from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "./chat-interface";

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
          <span className="font-medium text-text-secondary">{count} {count === 1 ? "source" : "sources"}</span> used
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

// shared markdown renderer config
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
  ),
  code: ({
    children,
    className: cls,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => {
    const isBlock = cls?.includes("language-");
    return isBlock ? (
      <code className="block bg-black/30 rounded-lg p-3 text-xs font-mono my-2 overflow-x-auto whitespace-pre">
        {children}
      </code>
    ) : (
      <code className="bg-subtle px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-text mt-3 mb-1">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="font-medium text-text mt-2 mb-1">{children}</h4>
  ),
};

// full-page message bubble
export const FullMessageBubble: FC<{
  message: Message;
  sessionId?: string | null;
}> = ({ message: m, sessionId }) => {
  const [rating, setRating] = useState<number | null>(m.rating ?? null);

  const handleRating = async (value: 1 | -1) => {
    if (!sessionId || m.id === "welcome") return;
    const next = rating === value ? null : value;
    setRating(next);
    await fetch(`/api/chat/sessions/${sessionId}/messages/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: next }),
    });
  };

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-lg">
          <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-primary-500/85 text-text-on-primary text-sm leading-relaxed">
            <p>{m.content}</p>
          </div>
        </div>
      </div>
    );
  }

  const isThinkingStreaming = !!m.thinking && !m.content.trim();
  const hasContent = m.content.trim().length > 0;
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

      <div className="text-sm leading-relaxed text-text">
        {hasContent ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {m.content}
          </ReactMarkdown>
        ) : !m.thinking ? (
          <TypingDots />
        ) : null}
      </div>

      {hasSources && <SourcesBlock sources={m.sources!} retrieval={m.retrieval} />}

      <div className="flex items-center gap-2">
        <p className="text-xs text-text-tertiary opacity-60">
          {new Date(m.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {sessionId && m.id !== "welcome" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleRating(1)}
              className="p-0.5 transition-colors"
              title="Helpful"
            >
              <HandThumbUpIcon
                className={`w-4 h-4 ${rating === 1 ? "text-primary-400" : "text-text-tertiary opacity-60 hover:opacity-100"}`}
              />
            </button>
            <button
              type="button"
              onClick={() => void handleRating(-1)}
              className="p-0.5 transition-colors"
              title="Not helpful"
            >
              <HandThumbDownIcon
                className={`w-4 h-4 ${rating === -1 ? "text-primary-400" : "text-text-tertiary opacity-60 hover:opacity-100"}`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// compact message bubble (sidebar variant)
export const CompactMessageBubble: FC<{ message: Message }> = ({
  message: m,
}) => {
  const isThinkingStreaming = !!m.thinking && !m.content.trim();
  const hasSources = Array.isArray(m.sources) && m.sources.length > 0;

  return (
    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] space-y-1.5">
        {m.role === "assistant" && m.thinking && (
          <ThinkingBlock
            text={m.thinking}
            isStreaming={isThinkingStreaming}
            duration={m.thinkingDuration}
          />
        )}

        <div
          className={`px-2.5 py-1.5 rounded-md text-xs leading-relaxed ${
            m.role === "user"
              ? "bg-primary-500/70 text-text-on-primary rounded-br-sm"
              : "bg-surface border border-border-subtle text-text-secondary rounded-bl-sm"
          }`}
        >
          {m.role === "assistant" ? (
            m.content.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                  code: ({ children }) => (
                    <code className="bg-subtle px-1 rounded text-xs">{children}</code>
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
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
