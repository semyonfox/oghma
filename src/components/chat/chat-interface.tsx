"use client";

import { FC, useState, useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useChatStream } from "@/lib/chat/hooks/use-chat-stream";
import { useChatPersistence } from "@/lib/chat/hooks/use-chat-persistence";
import { CompactMessageBubble, FullMessageBubble } from "./message-bubble";

// re-export types so existing consumers keep working
export type {
  Message,
  SearchContextData,
  ChatContextItem,
} from "@/lib/chat/types";

interface ChatInterfaceProps {
  /** Compact mode for the inspector sidebar mini-chat */
  compact?: boolean;
  /** Resume an existing chat session by ID */
  sessionId?: string;
  /** Pre-select a note as the chat context */
  noteId?: string;
  noteTitle?: string;
  selectedNotes?: { id: string; title: string }[];
  selectedFolders?: { id: string; title: string }[];
  /** Called when a new session is created server-side (id, title) */
  onSessionCreated?: (sessionId: string, title: string) => void;
  /** Called when the user clears the current scope */
  onClearContext?: () => void;
  /** Optional extra class on the wrapper */
  className?: string;
}

// i18n keys
const WELCOME_COMPACT_KEY = "chat.welcome_compact";
const WELCOME_FULL_KEY = "chat.welcome_full";

function makeWelcomeMessage(t: (key: string) => string, compact: boolean): string {
  return compact ? t(WELCOME_COMPACT_KEY) : t(WELCOME_FULL_KEY);
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
  const welcomeMessage = makeWelcomeMessage(t, compact);

  const {
    thinkingMode,
    toggleThinking,
    restoredMessages,
    restored,
    updateRefs,
  } = useChatPersistence({
    compact,
    controlledSessionId,
    welcomeMessage,
  });

  const {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    loading,
    error,
    setError,
    send,
  } = useChatStream({
    t,
    noteId,
    noteTitle,
    selectedNotes,
    selectedFolders,
    thinkingMode,
    onSessionCreated,
  });

  // initialize messages with the welcome message
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeMessage,
        timestamp: Date.now(),
      },
    ]);
  }, [welcomeMessage, setMessages]);

  // apply restored session messages when available
  useEffect(() => {
    if (!restoredMessages) return;
    if (controlledSessionId) {
      setSessionId(controlledSessionId);
    }
    setMessages(restoredMessages);
  }, [restoredMessages, controlledSessionId, setMessages, setSessionId]);

  // keep persistence refs in sync for unload handlers
  useEffect(() => {
    updateRefs({ messages, sessionId, loading });
  }, [messages, sessionId, loading, updateRefs]);

  // auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // input state (local to this component -- not worth extracting)
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const thinkingActive = thinkingMode !== "off";

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");

    // build history (skip welcome message)
    const history = messages
      .filter((m) => m.id !== "welcome")
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    void send(text, history);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clear = () => {
    if (onClearContext) {
      onClearContext();
      return;
    }

    // clean up any saved draft for the current session
    if (sessionId) {
      try {
        sessionStorage.removeItem(`chat-draft:${sessionId}`);
      } catch {
        // ignore
      }
    }

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeMessage,
        timestamp: Date.now(),
      },
    ]);
    setSessionId(null);
    setError(null);
  };

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
              onClick={handleSend}
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
          {/* context badge -- shown when a note/scope is active */}
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
              handleSend();
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
