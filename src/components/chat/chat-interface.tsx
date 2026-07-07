"use client";

import {
  FC,
  ReactNode,
  useId,
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  FormEvent,
} from "react";
import { PaperAirplaneIcon, StopCircleIcon, DocumentTextIcon, FolderIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useChatStream } from "@/lib/chat/hooks/use-chat-stream";
import { useChatPersistence } from "@/lib/chat/hooks/use-chat-persistence";
import { CompactMessageBubble, FullMessageBubble } from "./message-bubble";
import ChatSplash from "./chat-splash";

// re-export types so existing consumers keep working
export type {
  Message,
  MessagePart,
  SearchContextData,
  ChatContextItem,
} from "@/lib/chat/types";

/**
 * Small pill toggle used above the chat input (RAG / thinking). Shares the
 * active/inactive styling and shows a rich hover card describing the option.
 */
function TogglePill({
  active,
  onClick,
  icon,
  label,
  tooltipTitle,
  tooltipText,
  dense = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tooltipTitle: string;
  tooltipText: string;
  dense?: boolean;
}) {
  const tooltipId = useId();
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-describedby={tooltipId}
        className={`flex items-center rounded-radius-md border font-medium transition-colors ${
          dense ? "gap-1 px-1.5 py-[3px] text-xs" : "gap-1.5 px-2.5 py-1 text-xs"
        } ${
          active
            ? "text-primary-300 bg-primary-500/10 border-primary-500/20 hover:bg-primary-500/15"
            : "text-text-tertiary border-border-subtle hover:text-text-secondary hover:border-border"
        }`}
      >
        {icon}
        {label}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 flex w-48 flex-col gap-0.5 rounded-radius-md border border-border-subtle bg-surface-elevated px-2 py-1.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        <span className="text-xs font-semibold text-text">{tooltipTitle}</span>
        <span className="text-[11px] leading-snug text-text-tertiary">
          {tooltipText}
        </span>
      </div>
    </div>
  );
}

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
  onStreamComplete,
  onRemoveNote,
  onRemoveFolder,
  className = "",
}) => {
  const { t } = useI18n();

  const {
    thinkingMode,
    toggleThinking,
    useRag,
    toggleRag,
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
    send,
    cancel,
  } = useChatStream({
    t,
    noteId,
    noteTitle,
    selectedNotes,
    selectedFolders,
    thinkingMode,
    useRag,
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

  // auto-scroll: follow streaming output only while the user is pinned to the
  // bottom. If they scroll up to read, stop following so the view stays put
  // while the reply keeps generating below.
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom <= 80;
  };

  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // input state (local to this component -- not worth extracting)
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const thinkingActive = thinkingMode !== "off";

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;

    // sending a message always re-pins the view to the bottom
    pinnedToBottomRef.current = true;

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

  if (compact) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-[5px]"
        >
          {messages.map((m) => (
            <CompactMessageBubble key={m.id} message={m} />
          ))}

          {error && <p className="text-xs text-error-400 px-1">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 border-t border-border-subtle px-2 py-1.5">
          <div className="mb-1.5 flex items-center gap-1 px-0.5">
            <TogglePill
              dense
              active={useRag}
              onClick={toggleRag}
              icon={<DocumentTextIcon className="h-3 w-3" />}
              label={t("chat.use_notes_short")}
              tooltipTitle={t("chat.rag_title")}
              tooltipText={t("chat.rag_tooltip")}
            />
            <TogglePill
              dense
              active={thinkingActive}
              onClick={toggleThinking}
              icon={<span aria-hidden="true">◆</span>}
              label={thinkingActive ? t("Thinking") : t("Think")}
              tooltipTitle={t("chat.thinking_title")}
              tooltipText={t("chat.thinking_tooltip")}
            />
          </div>
          <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-radius-md px-2.5 py-[5px] focus-within:border-primary-500/50 transition-colors">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_about_note")}
              disabled={loading}
              className="flex-1 min-w-0 bg-transparent text-xs text-text-secondary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-radius-sm transition-colors flex-shrink-0"
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-10 py-3 obsidian-scrollbar"
      >
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
              <p className="text-xs text-error-400 bg-error-500/10 border border-error-500/20 px-3 py-2 rounded-radius-lg">
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
                    <button
                      onClick={() => onRemoveNote(note.id)}
                      className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity leading-4"
                      title={t("Remove {title}", { title: note.title })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {selectedFolders.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <FolderIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{folder.title}</span>
                  {onRemoveFolder && (
                    <button
                      onClick={() => onRemoveFolder(folder.id)}
                      className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity leading-4"
                      title={t("Remove {title}", { title: folder.title })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <TogglePill
              active={useRag}
              onClick={toggleRag}
              icon={<DocumentTextIcon className="h-3 w-3" />}
              label={t("chat.use_notes")}
              tooltipTitle={t("chat.rag_title")}
              tooltipText={t("chat.rag_tooltip")}
            />
            <TogglePill
              active={thinkingActive}
              onClick={toggleThinking}
              icon={<span aria-hidden="true">◆</span>}
              label={thinkingActive ? t("Thinking") : t("Think")}
              tooltipTitle={t("chat.thinking_title")}
              tooltipText={t("chat.thinking_tooltip")}
            />
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-radius-lg px-2.5 py-2 focus-within:border-primary-500/50 transition-colors"
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
              className="flex-1 bg-transparent text-sm leading-snug text-text placeholder:text-text-tertiary focus:outline-none resize-none disabled:opacity-50"
              style={{ minHeight: "20px", maxHeight: "96px" }}
            />
            {loading ? (
              <button
                type="button"
                onClick={cancel}
                className="flex-shrink-0 p-1.5 bg-error-500/15 hover:bg-error-500/25 text-error-400 hover:text-error-300 rounded-radius-md transition-colors"
                title={t("Stop generating")}
              >
                <StopCircleIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex-shrink-0 p-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-text-on-primary rounded-radius-md transition-colors"
              >
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <p className="text-center text-xs text-text-tertiary opacity-50 mt-1.5">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
