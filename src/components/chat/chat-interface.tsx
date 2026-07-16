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

export function shouldPreserveLiveSession(
  controlledSessionId: string | undefined,
  localSessionId: string | null,
  messageCount: number,
  ownsLiveStream = false,
): boolean {
  return Boolean(
    messageCount > 0 &&
      (ownsLiveStream ||
        (controlledSessionId && controlledSessionId === localSessionId)),
  );
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
    backgroundLoading,
    backgroundGenerationId,
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
    resume,
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
  const busy = loading || backgroundLoading;
  const resumedGenerationRef = useRef<string | null>(null);
  const ownsLiveStreamRef = useRef(false);

  // Latch ownership before the server-assigned session ID is reflected by the
  // parent. React may render that controlled ID before the hook's local ID,
  // so comparing IDs alone is not sufficient to protect optimistic messages.
  if (loading && messages.length > 0) {
    ownsLiveStreamRef.current = true;
  }

  // apply restored session messages when available
  const restoredAppliedRef = useRef(false);
  useEffect(() => {
    // A new chat receives its server ID while its first reply is still live.
    // The parent then passes that ID back as controlledSessionId, which starts
    // a restore request. Preserve the optimistic messages in this mounted
    // instance: the restore snapshot can be older than the active stream and
    // would remove the assistant message that incoming tokens target.
    if (
      shouldPreserveLiveSession(
        controlledSessionId,
        sessionId,
        messages.length,
        ownsLiveStreamRef.current,
      )
    ) {
      restoredAppliedRef.current = true;
      return;
    }
    if (
      !restoredMessages ||
      (restoredAppliedRef.current && (backgroundLoading || loading))
    ) {
      return;
    }
    restoredAppliedRef.current = true;
    if (controlledSessionId) {
      setSessionId(controlledSessionId);
    }
    setMessages(restoredMessages);
  }, [
    restoredMessages,
    controlledSessionId,
    sessionId,
    messages.length,
    backgroundLoading,
    loading,
    setMessages,
    setSessionId,
  ]);

  useEffect(() => {
    if (
      !restoredAppliedRef.current ||
      !backgroundGenerationId ||
      resumedGenerationRef.current === backgroundGenerationId
    ) {
      return;
    }
    resumedGenerationRef.current = backgroundGenerationId;
    void resume(backgroundGenerationId);
  }, [backgroundGenerationId, restoredMessages, resume]);

  // keep persistence refs in sync for unload handlers
  useEffect(() => {
    updateRefs({ messages, sessionId, loading: busy });
  }, [messages, sessionId, busy, updateRefs]);

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
  }, [messages, busy]);

  // input state (local to this component -- not worth extracting)
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const thinkingActive = thinkingMode !== "off";
  const thinkingLabel = thinkingActive ? t("Thinking on") : t("Thinking off");

  const handleSend = () => {
    const text = input.trim();
    if (!text || busy) return;

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
          {messages.map((m, index) => (
            <CompactMessageBubble
              key={m.id}
              message={m}
              isStreaming={busy && index === messages.length - 1}
            />
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
              label={thinkingLabel}
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
              disabled={busy}
              className="flex-1 min-w-0 bg-transparent text-xs text-text-secondary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={busy || !input.trim()}
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
        <div
          className={`mx-auto flex w-full max-w-3xl flex-col space-y-2.5 ${
            messages.length === 0 ? "min-h-full justify-center pb-12" : ""
          }`}
        >
          {messages.length === 0 ? (
            <ChatSplash />
          ) : (
            messages.map((m, index) => (
              <FullMessageBubble
                key={m.id}
                message={m}
                sessionId={sessionId}
                isStreaming={busy && index === messages.length - 1}
              />
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
      <div
        className="flex-shrink-0 border-t border-border-subtle bg-background px-3 py-3 md:px-8 lg:px-10"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-3xl">
          {(selectedNotes.length > 0 || selectedFolders.length > 0 || (noteTitle && selectedNotes.length === 0)) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
              {noteTitle && selectedNotes.length === 0 && selectedFolders.length === 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[150px]">{noteTitle}</span>
                </span>
              )}
              {selectedNotes.map((note) => (
                <span key={note.id} className="flex items-center gap-1 px-2 py-1 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{note.title}</span>
                  {onRemoveNote && (
                    <button
                      onClick={() => onRemoveNote(note.id)}
                      className="-mr-0.5 ml-0.5 rounded-full px-0.5 leading-4 opacity-60 transition-opacity hover:opacity-100"
                      title={t("Remove {title}", { title: note.title })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {selectedFolders.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1 px-2 py-1 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary">
                  <FolderIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{folder.title}</span>
                  {onRemoveFolder && (
                    <button
                      onClick={() => onRemoveFolder(folder.id)}
                      className="-mr-0.5 ml-0.5 rounded-full px-0.5 leading-4 opacity-60 transition-opacity hover:opacity-100"
                      title={t("Remove {title}", { title: folder.title })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
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
              label={thinkingLabel}
              tooltipTitle={t("chat.thinking_title")}
              tooltipText={t("chat.thinking_tooltip")}
            />
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-1.5 rounded-radius-lg border border-border-subtle bg-surface px-2.5 py-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/25 md:items-center md:py-2"
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
              disabled={busy}
              rows={1}
              className="min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-snug text-text placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 md:py-0"
              style={{ minHeight: "20px", maxHeight: "96px" }}
            />
            {busy ? (
              <button
                type="button"
                onClick={loading ? cancel : undefined}
                disabled={backgroundLoading}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md bg-error-500/15 text-error-400 transition-colors hover:bg-error-500/25 hover:text-error-300 disabled:cursor-wait disabled:opacity-60 md:h-8 md:w-8"
                title={
                  backgroundLoading
                    ? t("Generating in background")
                    : t("Stop generating")
                }
              >
                <StopCircleIcon
                  className={`h-4 w-4 ${backgroundLoading ? "animate-pulse" : ""}`}
                />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md bg-primary-600 text-text-on-primary transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40 md:h-8 md:w-8"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
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
