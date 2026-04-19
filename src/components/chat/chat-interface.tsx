"use client";

import { FC, useState, useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { PaperAirplaneIcon, StopCircleIcon, DocumentTextIcon, FolderIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useChatStream } from "@/lib/chat/hooks/use-chat-stream";
import { useChatPersistence } from "@/lib/chat/hooks/use-chat-persistence";
import { CompactMessageBubble, FullMessageBubble } from "./message-bubble";
import ChatSplash from "./chat-splash";

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
  /** Called when a stream completes — useful for refreshing session list order */
  onStreamComplete?: () => void;
  onRemoveNote?: (id: string) => void;
  onRemoveFolder?: (id: string) => void;
  /** Optional extra class on the wrapper */
  className?: string;
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
  onStreamComplete,
  onRemoveNote,
  onRemoveFolder,
  className = "",
}) => {
  const { t } = useI18n();

  const {
    thinkingMode,
    toggleThinking,
    restoredMessages,
    updateRefs,
  } = useChatPersistence({
    compact,
    controlledSessionId,
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
    cancel,
  } = useChatStream({
    t,
    noteId,
    noteTitle,
    selectedNotes,
    selectedFolders,
    thinkingMode,
    onSessionCreated,
    onStreamComplete,
  });

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
    if (inputRef.current) {
      (inputRef.current as HTMLTextAreaElement).style.height = "20px";
    }

    const history = messages
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

    setMessages([]);
    setSessionId(null);
    setError(null);
  };

  if (compact) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-[5px]">
          {messages.map((m) => (
            <CompactMessageBubble key={m.id} message={m} />
          ))}

          {error && <p className="text-xs text-error-400 px-1">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 border-t border-border-subtle px-2 py-1.5">
          <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-lg px-2.5 py-[5px] focus-within:border-primary-500/50 transition-colors">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_about_note")}
              disabled={loading}
              className="flex-1 min-w-0 bg-transparent text-[11px] text-text-secondary placeholder-text-tertiary focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={toggleThinking}
              className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-[3px] rounded border transition-colors ${
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
              className="p-1 bg-primary-500 hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-md transition-colors flex-shrink-0"
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
      <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-10 py-3 obsidian-scrollbar">
        <div className="mx-auto flex w-full max-w-3xl flex-col space-y-2.5">
          {messages.length === 0 ? (
            <ChatSplash />
          ) : (
            messages.map((m) => (
              <FullMessageBubble key={m.id} message={m} sessionId={sessionId} />
            ))
          )}

          {error && (
            <div className="flex justify-center">
              <p className="text-xs text-error-400 bg-error-500/10 border border-error-500/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* input area */}
      <div className="flex-shrink-0 border-t border-border-subtle bg-background px-4 md:px-8 lg:px-10 py-3">
        <div className="mx-auto max-w-3xl">
          {(selectedNotes.length > 0 || selectedFolders.length > 0 || (noteTitle && selectedNotes.length === 0)) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
              {noteTitle && selectedNotes.length === 0 && selectedFolders.length === 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[150px]">{noteTitle}</span>
                </span>
              )}
              {selectedNotes.map((note) => (
                <span key={note.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{note.title}</span>
                  {onRemoveNote && (
                    <button onClick={() => onRemoveNote(note.id)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity leading-none" title={`Remove ${note.title}`}>×</button>
                  )}
                </span>
              ))}
              {selectedFolders.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <FolderIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{folder.title}</span>
                  {onRemoveFolder && (
                    <button onClick={() => onRemoveFolder(folder.id)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity leading-none" title={`Remove ${folder.title}`}>×</button>
                  )}
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-lg px-2.5 py-2 focus-within:border-primary-500/50 transition-colors"
          >
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_placeholder")}
              disabled={loading}
              rows={1}
              className="flex-1 bg-transparent text-sm leading-snug text-text placeholder-text-tertiary focus:outline-none resize-none disabled:opacity-50"
              style={{ minHeight: "20px", maxHeight: "96px" }}
            />
            <button
              type="button"
              onClick={toggleThinking}
              className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
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
            {loading ? (
              <button
                type="button"
                onClick={cancel}
                className="flex-shrink-0 p-1.5 bg-error-500/15 hover:bg-error-500/25 text-error-400 hover:text-error-300 rounded-md transition-colors"
                title="Stop generating"
              >
                <StopCircleIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex-shrink-0 p-1.5 bg-primary-500 hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-md transition-colors"
              >
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <p className="text-center text-[11px] text-text-tertiary opacity-50 mt-1.5">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
