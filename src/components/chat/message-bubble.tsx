"use client";

import { FC } from "react";
import { SparklesIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { Message } from "./chat-interface";

// source chips for referencing notes
export const SourceChips: FC<{ sources: { id: string; title: string }[] }> = ({
  sources,
}) => {
  const { t } = useI18n();
  if (!Array.isArray(sources) || !sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {sources.map((s) => (
        <a
          key={s.id}
          href={`/notes/${s.id}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-subtle border border-border-subtle text-xs text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <DocumentTextIcon className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="max-w-[120px] truncate">
            {s.title || t("Untitled")}
          </span>
        </a>
      ))}
    </div>
  );
};

// typing animation dots
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

// compact message bubble (sidebar variant)
export const CompactMessageBubble: FC<{ message: Message }> = ({
  message: m,
}) => (
  <div
    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
  >
    <div
      className={`max-w-[85%] px-2.5 py-1.5 rounded-md text-xs leading-relaxed ${
        m.role === "user"
          ? "bg-primary-500/70 text-text-on-primary rounded-br-sm"
          : "bg-surface border border-border-subtle text-text-secondary rounded-bl-sm"
      }`}
    >
      {m.role === "assistant" ? (
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
        m.content
      )}
      {m.sources && m.sources.length > 0 && <SourceChips sources={m.sources} />}
    </div>
  </div>
);

// full-page message bubble
export const FullMessageBubble: FC<{ message: Message }> = ({ message: m }) => {
  const { t } = useI18n();

  return (
    <div
      className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
    >
      {m.role === "assistant" && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/15 border border-primary-500/25 flex items-center justify-center mt-0.5">
          <SparklesIcon className="w-3.5 h-3.5 text-primary-400" />
        </div>
      )}

      <div className={`max-w-2xl ${m.role === "user" ? "max-w-lg" : ""}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            m.role === "user"
              ? "bg-primary-500/85 text-text-on-primary rounded-br-sm"
              : "glass-card text-text rounded-bl-sm"
          }`}
        >
          {m.role === "assistant" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-2 space-y-0.5">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-2 space-y-0.5">
                    {children}
                  </ol>
                ),
                code: ({ children, className: cls }) => {
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
                strong: ({ children }) => (
                  <strong className="font-semibold text-text">
                    {children}
                  </strong>
                ),
                h3: ({ children }) => (
                  <h3 className="font-semibold text-text mt-3 mb-1">
                    {children}
                  </h3>
                ),
                h4: ({ children }) => (
                  <h4 className="font-medium text-text mt-2 mb-1">
                    {children}
                  </h4>
                ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          ) : (
            <p>{m.content}</p>
          )}
        </div>

        {m.sources && m.sources.length > 0 && (
          <div className="mt-2 ml-1">
            <p className="text-xs text-text-tertiary mb-1">
              {t("chat.sources")}
            </p>
            <SourceChips sources={m.sources} />
          </div>
        )}

        <p className="text-xs text-text-tertiary opacity-60 mt-1 ml-1">
          {new Date(m.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
};
