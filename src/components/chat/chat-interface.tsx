"use client";

import {
  FC,
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  FormEvent,
} from "react";
import {
  PaperAirplaneIcon,
  SparklesIcon,
  DocumentTextIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useI18n from "@/lib/notes/hooks/use-i18n";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string }[];
  timestamp: number;
}

interface ChatInterfaceProps {
  /** Compact mode for the inspector sidebar mini-chat */
  compact?: boolean;
  /** Resume an existing chat session by ID */
  sessionId?: string;
  /** Pre-select a note as the chat context */
  noteId?: string;
  noteTitle?: string;
  /** Called when a new session is created server-side (id, title) */
  onSessionCreated?: (sessionId: string, title: string) => void;
  /** Optional extra class on the wrapper */
  className?: string;
}

// i18n keys for welcome messages — translated at render time via t()
const WELCOME_COMPACT_KEY = "chat.welcome_compact";
const WELCOME_FULL_KEY = "chat.welcome_full";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TypingDots: FC = () => (
  <div className="flex items-center gap-1 px-1 py-0.5">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </div>
);

const SourceChips: FC<{ sources: { id: string; title: string }[] }> = ({
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
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors"
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

const ChatInterface: FC<ChatInterfaceProps> = ({
  compact = false,
  sessionId: controlledSessionId,
  noteId,
  noteTitle,
  onSessionCreated,
  className = "",
}) => {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: compact ? t(WELCOME_COMPACT_KEY) : t(WELCOME_FULL_KEY),
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    controlledSessionId ?? null,
  );
  const [restored, setRestored] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // restore messages for an existing session
  useEffect(() => {
    if (restored) return;
    if (!controlledSessionId) {
      setRestored(true);
      return;
    }

    const restore = async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${controlledSessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length) {
          setSessionId(controlledSessionId);
          const restored: Message[] = data.messages.map(
            (m: {
              id: string;
              role: string;
              content: string;
              sources?: { id: string; title: string }[];
              created_at?: string;
            }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              sources: Array.isArray(m.sources) ? m.sources : [],
              timestamp: m.created_at
                ? new Date(m.created_at).getTime()
                : Date.now(),
            }),
          );
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: compact ? t(WELCOME_COMPACT_KEY) : t(WELCOME_FULL_KEY),
              timestamp: Date.now(),
            },
            ...restored,
          ]);
        }
      } catch {
        // silently fail — fresh session is fine
      } finally {
        setRestored(true);
      }
    };
    void restore();
  }, [controlledSessionId, compact, restored]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");

    const userMsg: Message = {
      id: makeId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // build history for context (skip welcome message)
    const history = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, noteId, sessionId, history }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        onSessionCreated?.(data.sessionId, text.slice(0, 60));
      }
      const assistantMsg: Message = {
        id: makeId(),
        role: "assistant",
        content: data.reply,
        sources: Array.isArray(data.sources) ? data.sources : [],
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : t("error.something_went_wrong");
      const friendlyMsg =
        errMsg.includes("Failed to generate") || errMsg.includes("502")
          ? "AI is temporarily unavailable. Please try again in a moment."
          : errMsg;
      setError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const clear = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: compact ? t(WELCOME_COMPACT_KEY) : t(WELCOME_FULL_KEY),
        timestamp: Date.now(),
      },
    ]);
    setSessionId(null);
    setError(null);
  };

  // ── compact (sidebar) variant ─────────────────────────────────────────
  if (compact) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {/* messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600/80 text-white rounded-br-none"
                    : "bg-white/6 text-gray-200 rounded-bl-none border border-white/8"
                }`}
              >
                {m.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      code: ({ children }) => (
                        <code className="bg-white/10 px-1 rounded text-[10px]">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  m.content
                )}
                {m.sources && m.sources.length > 0 && (
                  <SourceChips sources={m.sources} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div
              className="flex justify-start"
              role="status"
              aria-label="AI is thinking"
            >
              <div className="bg-white/6 border border-white/8 rounded-lg rounded-bl-none px-2.5 py-1.5">
                <TypingDots />
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {/* input */}
        <div className="flex-shrink-0 border-t border-white/8 px-2 py-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_about_note")}
              disabled={loading}
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors flex-shrink-0"
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── full-page variant ─────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* context banner */}
      {(noteId || noteTitle) && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/8 bg-white/3 text-xs text-gray-400">
          <SparklesIcon className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>{t("chat.context_label")} </span>
          <a
            href={`/notes/${noteId}`}
            className="text-indigo-300 hover:text-indigo-200 truncate transition-colors"
          >
            {noteTitle || t("chat.selected_note")}
          </a>
          <button
            onClick={clear}
            className="ml-auto flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            title={t("chat.clear_conversation")}
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            <span>{t("chat.clear")}</span>
          </button>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-6 space-y-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mt-0.5">
                <SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />
              </div>
            )}

            <div className={`max-w-2xl ${m.role === "user" ? "max-w-lg" : ""}`}>
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm border border-white/8"
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
                          <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">
                            {children}
                          </code>
                        );
                      },
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">
                          {children}
                        </strong>
                      ),
                      h3: ({ children }) => (
                        <h3 className="font-semibold text-white mt-3 mb-1">
                          {children}
                        </h3>
                      ),
                      h4: ({ children }) => (
                        <h4 className="font-medium text-white mt-2 mb-1">
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
                  <p className="text-[11px] text-gray-600 mb-1">
                    {t("chat.sources")}
                  </p>
                  <SourceChips sources={m.sources} />
                </div>
              )}

              <p className="text-[10px] text-gray-600 mt-1 ml-1">
                {new Date(m.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div
            className="flex gap-3 justify-start"
            role="status"
            aria-label="AI is thinking"
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <SparklesIcon className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            </div>
            <div className="bg-gray-800 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input bar */}
      <div className="flex-shrink-0 border-t border-white/8 bg-gray-900 px-4 md:px-8 lg:px-12 py-4">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-3 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-indigo-500/50 transition-colors"
          >
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // auto-grow up to 5 rows
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_placeholder")}
              disabled={loading}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none disabled:opacity-50 leading-relaxed"
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex-shrink-0 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors mb-0.5"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[11px] text-gray-700 mt-2">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
