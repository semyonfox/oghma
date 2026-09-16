"use client";

import {
  FC,
  ReactNode,
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  FormEvent,
} from "react";
import { PaperAirplaneIcon, StopCircleIcon, DocumentTextIcon, FolderIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useChatStream } from "@/lib/chat/hooks/use-chat-stream";
import {
  reconcileChatMessages,
  useChatPersistence,
} from "@/lib/chat/hooks/use-chat-persistence";
import type { Message } from "@/lib/chat/types";
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
export function TogglePill({
  active,
  onClick,
  icon,
  label,
  tooltipTitle,
  tooltipText,
  dense = false,
  tooltipAlign = "left",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tooltipTitle: string;
  tooltipText: string;
  dense?: boolean;
  tooltipAlign?: "left" | "right";
}) {
  const tooltipId = useId();
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-describedby={tooltipId}
        className={`peer flex items-center rounded-radius-md border font-medium transition-colors ${
          dense
            ? "min-h-11 gap-1 px-2 text-xs lg:min-h-0 lg:px-1.5 lg:py-[3px]"
            : "min-h-11 gap-1.5 px-2.5 text-xs lg:min-h-0 lg:py-1"
        } ${
          active
            ? "text-primary-700 dark:text-primary-300 bg-primary-500/10 border-primary-500/20 hover:bg-primary-500/15"
            : "text-text-tertiary border-border-subtle hover:text-text-secondary hover:border-border"
        }`}
      >
        {icon}
        {label}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-1.5 flex w-48 flex-col gap-0.5 rounded-radius-md border border-border-subtle bg-surface-elevated px-2 py-1.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 peer-focus-visible:opacity-100 ${
          tooltipAlign === "right" ? "right-0" : "left-0"
        }`}
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
  onStreamComplete?: (sessionId: string | null) => void;
  onRemoveNote?: (id: string) => void;
  onRemoveFolder?: (id: string) => void;
  /** Optional extra class on the wrapper */
  className?: string;
}

export function isChatComposerReady(
  controlledSessionId: string | undefined,
  restored: boolean,
  busy: boolean,
): boolean {
  return !busy && (!controlledSessionId || restored);
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

  const ownsMessagesRef = useRef(false);
  const recoveringMessagesRef = useRef(false);
  const resumedGenerationRef = useRef<string | null>(null);
  const appliedSnapshotRef = useRef<Message[] | null>(null);
  const appliedMessagesRef = useRef<Message[] | null>(null);

  const {
    thinkingMode,
    toggleThinking,
    useRag,
    toggleRag,
    restoredMessages,
    restoredGenerating,
    restored,
    restoreError,
    retryRestore,
    finishBackgroundGeneration,
    backgroundLoading,
    backgroundGenerationId,
    updateRefs,
  } = useChatPersistence({
    compact,
    controlledSessionId,
  });

  const retryConversation = useCallback(() => {
    recoveringMessagesRef.current = true;
    resumedGenerationRef.current = null;
    retryRestore();
  }, [retryRestore]);

  const handleStreamComplete = useCallback(
    (completedSessionId: string | null, generationId?: string) => {
      finishBackgroundGeneration(generationId);
      onStreamComplete?.(completedSessionId);
    },
    [finishBackgroundGeneration, onStreamComplete],
  );

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
    controlledSessionId,
    sessionReady: !controlledSessionId || restored,
    onSessionCreated,
    onStreamComplete: handleStreamComplete,
    onTerminalFailure: retryConversation,
  });
  const busy = loading || backgroundLoading;
  const composerDisabled = !isChatComposerReady(
    controlledSessionId,
    restored,
    busy,
  );

  // Stop must reach the worker even before the background resume attaches,
  // Use this state when the hook does not know the generation ID yet.
  const stopGenerating = () => {
    if (backgroundGenerationId && !loading) {
      void fetch(`/api/chat/generations/${backgroundGenerationId}/cancel`, {
        method: "POST",
      }).catch(() => {});
    }
    cancel();
  };
  useEffect(() => {
    resumedGenerationRef.current = null;
    appliedSnapshotRef.current = null;
    appliedMessagesRef.current = null;
    // Adopting the URL of a newly created chat must keep its live reply.
    ownsMessagesRef.current = Boolean(
      controlledSessionId &&
        sessionId === controlledSessionId &&
        messages.length > 0,
    );
    if (!ownsMessagesRef.current) recoveringMessagesRef.current = false;
    // This reset belongs to navigation, not token or session-state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledSessionId]);

  // Hydrate once. After streaming starts, only an explicit recovery may adopt
  // a new terminal snapshot; changing the spinner state cannot replay history.
  useEffect(() => {
    if (
      !controlledSessionId ||
      !restored ||
      !restoredMessages ||
      appliedSnapshotRef.current === restoredMessages ||
      (ownsMessagesRef.current &&
        (!recoveringMessagesRef.current || restoredGenerating)) ||
      loading
    ) {
      return;
    }
    const nextMessages = reconcileChatMessages(messages, restoredMessages);
    recoveringMessagesRef.current = false;
    appliedSnapshotRef.current = restoredMessages;
    appliedMessagesRef.current = nextMessages;
    setSessionId(controlledSessionId);
    setMessages(nextMessages);
  }, [
    restoredGenerating,
    messages,
    restoredMessages,
    restored,
    controlledSessionId,
    loading,
    setMessages,
    setSessionId,
  ]);

  useEffect(() => {
    if (
      !restored ||
      !restoredMessages ||
      (!ownsMessagesRef.current && messages !== appliedMessagesRef.current) ||
      loading ||
      !backgroundGenerationId ||
      resumedGenerationRef.current === backgroundGenerationId
    ) {
      return;
    }
    resumedGenerationRef.current = backgroundGenerationId;
    ownsMessagesRef.current = true;
    void resume(backgroundGenerationId);
  }, [
    backgroundGenerationId,
    loading,
    messages,
    restored,
    restoredMessages,
    resume,
  ]);

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

  useEffect(() => {
    setInput("");
    pinnedToBottomRef.current = true;
  }, [controlledSessionId]);

  const thinkingActive = thinkingMode !== "off";
  const thinkingLabel = thinkingActive ? t("Thinking on") : t("Thinking off");

  const handleSend = () => {
    const text = input.trim();
    if (!text || composerDisabled) return;
    ownsMessagesRef.current = true;

    // sending a message always re-pins the view to the bottom
    pinnedToBottomRef.current = true;

    setInput("");
    if (inputRef.current) {
      (inputRef.current as HTMLTextAreaElement).style.height = "20px";
      inputRef.current.scrollTop = 0;
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
              key={m.renderKey ?? m.id}
              message={m}
              isStreaming={busy && index === messages.length - 1}
            />
          ))}

          {restoreError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 px-1 text-xs text-error-400"
            >
              <span>{t("error.something_went_wrong")}</span>
              <button
                type="button"
                onClick={retryConversation}
                className="font-medium text-primary-700 dark:text-primary-300 hover:text-primary-200"
              >
                {t("Try again")}
              </button>
            </div>
          )}
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
              tooltipAlign="right"
            />
          </div>
          <div className="flex min-h-11 items-center gap-1.5 rounded-radius-md border border-border-subtle bg-surface px-2.5 py-[5px] transition-colors focus-within:border-primary-500/50">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.ask_about_note")}
              aria-label={t("chat.ask_about_note")}
              disabled={composerDisabled}
              className="min-w-0 flex-1 bg-transparent text-base text-text-secondary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 lg:text-sm"
            />
            <button
              onClick={handleSend}
              disabled={composerDisabled || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-sm bg-primary-600 text-text-on-primary transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:w-9"
              aria-label={t("Send message")}
            >
              <PaperAirplaneIcon className="h-4 w-4" />
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
        className="flex-1 overflow-y-auto px-4 lg:px-10 py-3 obsidian-scrollbar"
      >
        <div
          className={`mx-auto flex w-full max-w-3xl flex-col space-y-2.5 ${
            messages.length === 0 ? "min-h-full justify-center pb-12" : ""
          }`}
        >
          {controlledSessionId &&
          (!restored || sessionId !== controlledSessionId) &&
          (messages.length === 0 || sessionId !== controlledSessionId) ? (
            restoreError ? null : (
              <div
                className="flex justify-center py-8"
                role="status"
                aria-label={t("Loading...")}
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
              </div>
            )
          ) : messages.length === 0 ? (
            <ChatSplash
              onSelectPrompt={(prompt) => {
                setInput(prompt);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            />
          ) : (
            messages.map((m, index) => (
              <FullMessageBubble
                key={m.renderKey ?? m.id}
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

          {restoreError && (
            <div className="flex justify-center">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-radius-lg border border-error-500/20 bg-error-500/10 px-3 py-2 text-xs text-error-400"
              >
                <span>{t("error.something_went_wrong")}</span>
                <button
                  type="button"
                  onClick={retryConversation}
                  className="font-medium text-primary-700 dark:text-primary-300 transition-colors hover:text-primary-200"
                >
                  {t("Try again")}
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* input area */}
      <div
        className="flex-shrink-0 border-t border-border-subtle bg-background px-3 py-3 lg:px-10"
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
                      className="touch-target-44 -mr-0.5 ml-0.5 rounded-full px-0.5 leading-4 opacity-60 transition-opacity hover:opacity-100"
                      aria-label={t("Remove {title}", { title: note.title })}
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
                      className="touch-target-44 -mr-0.5 ml-0.5 rounded-full px-0.5 leading-4 opacity-60 transition-opacity hover:opacity-100"
                      aria-label={t("Remove {title}", { title: folder.title })}
                      title={t("Remove {title}", { title: folder.title })}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="mb-1.5 hidden flex-wrap items-center gap-1.5 px-1 lg:flex">
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
              tooltipAlign="right"
            />
          </div>
          <details className="group mb-1.5 rounded-radius-md border border-border-subtle bg-surface/60 px-1 lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2 text-xs font-medium text-text-tertiary marker:content-none">
              {t("Chat options")}
              <span
                className="text-text-tertiary transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                ⌄
              </span>
            </summary>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle px-2 py-2">
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
                tooltipAlign="right"
              />
            </div>
          </details>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-1.5 rounded-radius-lg border border-border-subtle bg-surface px-2.5 py-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/25 lg:items-center lg:py-2"
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
              aria-label={t("chat.ask_placeholder")}
              disabled={composerDisabled}
              rows={1}
              className="min-h-11 max-h-24 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug text-text placeholder:text-text-tertiary focus:outline-none disabled:opacity-50 lg:min-h-5 lg:py-0"
            />
            {busy ? (
              <button
                type="button"
                onClick={stopGenerating}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md bg-error-500/15 text-error-400 transition-colors hover:bg-error-500/25 hover:text-error-300 lg:h-8 lg:w-8"
                aria-label={t("Stop generating")}
                title={t("Stop generating")}
              >
                <StopCircleIcon
                  className={`h-4 w-4 ${backgroundLoading ? "animate-pulse" : ""}`}
                />
              </button>
            ) : (
              <button
                type="submit"
                disabled={composerDisabled || !input.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md bg-primary-600 text-text-on-primary transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40 lg:h-8 lg:w-8"
                aria-label={t("Send message")}
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            )}
          </form>

          <p className="text-center text-xs leading-relaxed text-text-tertiary mt-1.5">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
