"use client";

import {
  FC,
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  FormEvent,
} from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { parseSseBlocks } from "@/lib/chat/sse";
import type { LlmThinkingMode } from "@/lib/ai-config";
import { toFriendlyChatError } from "@/lib/friendly-errors";
import { CompactMessageBubble, FullMessageBubble } from "./message-bubble";

export interface SearchContextData {
  scopeSize: number | null; // null = searched all notes
  resultsFound: number;
  results: { noteId: string; title: string; distance: number }[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingDuration?: number; // seconds from first thinking token to first content token
  sources?: { id: string; title: string }[];
  retrieval?: {
    scopeMode: "global" | "scoped";
    availableCount: number;
    availableFiles: { id: string; title: string }[];
    semanticHits: { id: string; title: string }[];
    usedFiles: { id: string; title: string }[];
  };
  searchContext?: SearchContextData;
  timestamp: number;
  rating?: number | null;
}

export interface ChatContextItem {
  id: string;
  title: string;
}

interface ChatInterfaceProps {
  /** Compact mode for the inspector sidebar mini-chat */
  compact?: boolean;
  /** Resume an existing chat session by ID */
  sessionId?: string;
  /** Pre-select a note as the chat context */
  noteId?: string;
  noteTitle?: string;
  selectedNotes?: ChatContextItem[];
  selectedFolders?: ChatContextItem[];
  /** Called when a new session is created server-side (id, title) */
  onSessionCreated?: (sessionId: string, title: string) => void;
  /** Called when the user clears the current scope */
  onClearContext?: () => void;
  /** Optional extra class on the wrapper */
  className?: string;
}

// i18n keys for welcome messages
const WELCOME_COMPACT_KEY = "chat.welcome_compact";
const WELCOME_FULL_KEY = "chat.welcome_full";
const THINKING_MODE_KEY = "chat-thinking-mode";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ChatInterface: FC<ChatInterfaceProps> = ({
  compact = false,
  sessionId: controlledSessionId,
  noteId,
  noteTitle,
  selectedNotes = [],
  selectedFolders = [],
  onSessionCreated,
  onClearContext,
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
  const [thinkingMode, setThinkingMode] = useState<LlmThinkingMode>("auto");
  const [restored, setRestored] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const thinkingStartRef = useRef<number | null>(null);

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
              rating?: number | null;
            }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              sources: Array.isArray(m.sources) ? m.sources : [],
              timestamp: m.created_at
                ? new Date(m.created_at).getTime()
                : Date.now(),
              rating: m.rating ?? null,
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
        // silently fail -- fresh session is fine
      } finally {
        setRestored(true);
      }
    };
    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledSessionId, compact, restored]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(THINKING_MODE_KEY);
    if (saved === "on" || saved === "off" || saved === "auto") {
      setThinkingMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THINKING_MODE_KEY, thinkingMode);
  }, [thinkingMode]);

  const toggleThinking = () => {
    setThinkingMode((current) => (current === "off" ? "on" : "off"));
  };

  const thinkingActive = thinkingMode !== "off";

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    thinkingStartRef.current = null;

    const userMsg: Message = {
      id: makeId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const assistantId = makeId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        timestamp: Date.now(),
      },
    ]);

    // build history for context (skip welcome message)
    const history = messages
      .filter((m) => m.id !== "welcome")
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const chatFunctionUrl = process.env.NEXT_PUBLIC_CHAT_URL;
      if (
        !chatFunctionUrl &&
        typeof window !== "undefined" &&
        window.location.hostname !== "localhost"
      ) {
        console.warn(
          "[chat] NEXT_PUBLIC_CHAT_URL not set — falling back to /api/chat (no streaming on Amplify)",
        );
      }
      let chatEndpoint = "/api/chat";
      let chatHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // when a Lambda function URL is configured, get a short-lived token
      // and call the Lambda directly (bypasses Amplify's 30s timeout)
      if (chatFunctionUrl) {
        const tokenRes = await fetch("/api/chat/token", { method: "POST" });
        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to get chat token");
        }
        const { token } = await tokenRes.json();
        chatEndpoint = chatFunctionUrl;
        chatHeaders["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify({
          message: text,
          noteId,
          noteTitle,
          noteIds: selectedNotes.map((note) => note.id),
          folderIds: selectedFolders.map((folder) => folder.id),
          selectedNotes,
          selectedFolders,
          sessionId,
          history,
          stream: true,
          thinkingMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          onSessionCreated?.(data.sessionId, text.slice(0, 60));
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: data.reply || "",
                  thinking: data.thinking || undefined,
                  sources: Array.isArray(data.sources) ? data.sources : [],
                  retrieval: data.retrieval,
                  searchContext: data.searchContext ?? undefined,
                }
              : m,
          ),
        );
        return;
      }

      if (!res.body) {
        throw new Error("Missing stream body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parseState = { buffer: "" };

      while (true) {
        const { value, done } = await reader.read();
        const chunk = done
          ? decoder.decode()
          : decoder.decode(value, { stream: true });

        if (chunk) {
          for (const frame of parseSseBlocks(chunk, parseState)) {
            let payload: any = {};
            try {
              payload = JSON.parse(frame.data);
            } catch {
              payload = {};
            }

            if (frame.event === "meta") {
              if (payload.sessionId && payload.sessionId !== sessionId) {
                setSessionId(payload.sessionId);
                onSessionCreated?.(payload.sessionId, text.slice(0, 60));
              }
              if (Array.isArray(payload.sources)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, sources: payload.sources }
                      : m,
                  ),
                );
              }
              if (payload.retrieval) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, retrieval: payload.retrieval }
                      : m,
                  ),
                );
              }
              continue;
            }

            if (frame.event === "search") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        searchContext: {
                          scopeSize: payload.scopeSize ?? null,
                          resultsFound: payload.resultsFound ?? 0,
                          results: Array.isArray(payload.results)
                            ? payload.results
                            : [],
                        },
                      }
                    : m,
                ),
              );
              continue;
            }

            if (frame.event === "thinking") {
              const text = typeof payload.text === "string" ? payload.text : "";
              if (!text) continue;
              if (!thinkingStartRef.current) {
                thinkingStartRef.current = Date.now();
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: `${m.thinking ?? ""}${text}` }
                    : m,
                ),
              );
              continue;
            }

            if (frame.event === "token") {
              const token =
                typeof payload.text === "string" ? payload.text : "";
              if (!token) continue;
              const duration = thinkingStartRef.current
                ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
                : undefined;
              if (thinkingStartRef.current) thinkingStartRef.current = null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `${m.content}${token}`,
                        thinkingDuration: m.thinkingDuration ?? duration,
                      }
                    : m,
                ),
              );
              continue;
            }

            if (frame.event === "tool-call") {
              const toolName =
                typeof payload.toolName === "string" ? payload.toolName : "";
              const labels: Record<string, string> = {
                getChunks: "Searching notes",
                readNote: "Reading note",
                findFolder: "Looking up folder",
                makeMDNote: "Creating note",
              };
              const label = labels[toolName] ?? toolName;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `${m.content}\n\n*${label}…*\n\n` }
                    : m,
                ),
              );
              continue;
            }

            if (frame.event === "error") {
              throw new Error(
                payload?.message || t("error.something_went_wrong"),
              );
            }
          }
        }

        if (done) break;

        // yield to the macrotask queue so React can flush pending renders;
        // without this, rapid reader.read() microtask resolution causes
        // all setState calls to batch into a single render at the end
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : t("error.something_went_wrong");
      const friendlyMessage = toFriendlyChatError(errMsg);
      setError(
        friendlyMessage.includes("temporarily unavailable")
          ? t("error.ai_unavailable")
          : t("error.something_went_wrong"),
      );
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
    if (onClearContext) {
      onClearContext();
      return;
    }

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

  // compact (sidebar) variant
  if (compact) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1.5">
          {messages.map((m) => (
            <CompactMessageBubble key={m.id} message={m} />
          ))}

          {error && <p className="text-xs text-error-400 px-1">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 border-t border-border-subtle px-2 py-2">
          <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-xl px-2.5 py-1.5 focus-within:border-primary-500/50 transition-colors">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_about_note")}
              disabled={loading}
              className="flex-1 min-w-0 bg-transparent text-xs text-text-secondary placeholder-text-tertiary focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={toggleThinking}
              className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-1 rounded border transition-colors ${
                thinkingActive
                  ? "text-primary-300 bg-primary-500/10 border-primary-500/20"
                  : "text-text-tertiary border-border-subtle hover:text-text-secondary"
              }`}
              title={thinkingActive ? "Thinking on" : "Thinking off"}
            >
              ◆ {thinkingActive ? "Thinking" : "Think"}
            </button>
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-1 bg-primary-500 hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-lg transition-colors flex-shrink-0"
            >
              <PaperAirplaneIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // full-page variant
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-6 space-y-5 obsidian-scrollbar">
        {messages.map((m) => (
          <FullMessageBubble key={m.id} message={m} sessionId={sessionId} />
        ))}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-error-400 bg-error-500/10 border border-error-500/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input area */}
      <div className="flex-shrink-0 border-t border-border-subtle bg-background px-4 md:px-8 lg:px-12 py-4">
        <div className="max-w-3xl mx-auto">
          {/* context badge — shown when a note/scope is active */}
          {(noteId ||
            noteTitle ||
            selectedNotes.length > 0 ||
            selectedFolders.length > 0) && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1.5 text-xs text-text-tertiary bg-surface border border-border-subtle rounded-md px-2.5 py-1 hover:border-border hover:text-text-secondary transition-colors"
                title="Clear context and start a new conversation"
              >
                {noteTitle
                  ? noteTitle
                  : selectedNotes.length > 0
                    ? `${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""}`
                    : "Selected folder"}
                <span className="opacity-50 ml-0.5">×</span>
              </button>
            </div>
          )}

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 bg-surface border border-border-subtle rounded-2xl px-4 py-3 focus-within:border-primary-500/50 transition-colors"
          >
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_placeholder")}
              disabled={loading}
              rows={1}
              className="flex-1 bg-transparent text-sm text-text placeholder-text-tertiary focus:outline-none resize-none disabled:opacity-50 leading-relaxed"
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
            <button
              type="button"
              onClick={toggleThinking}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                thinkingActive
                  ? "text-primary-300 bg-primary-500/10 border-primary-500/20 hover:bg-primary-500/15"
                  : "text-text-tertiary border-border-subtle hover:text-text-secondary hover:border-border"
              }`}
              title={
                thinkingActive
                  ? "Thinking on — click to disable"
                  : "Thinking off — click to enable"
              }
            >
              ◆ {thinkingActive ? "Thinking" : "Think"}
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex-shrink-0 p-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-xl transition-colors"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </form>

          <p className="text-center text-xs text-text-tertiary opacity-50 mt-2">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
