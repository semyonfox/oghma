"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "@/lib/chat/types";
import { normalizeMessageParts } from "@/lib/chat/types";
import {
  nextLlmThinkingMode,
  type LlmThinkingMode,
} from "@/lib/ai-config";

const THINKING_MODE_KEY = "chat-thinking-mode";
const USE_RAG_KEY = "chat-use-rag";

function logChatPersistence(
  message: string,
  details: Record<string, unknown> = {},
): void {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof console === "undefined"
  ) {
    return;
  }
  console.debug(`[chat-persistence] ${message}`, details);
}

interface PersistenceRefs {
  messages: Message[];
  sessionId: string | null;
  loading: boolean;
}

interface UseChatPersistenceOptions {
  compact: boolean;
  controlledSessionId?: string;
}

interface UseChatPersistenceResult {
  thinkingMode: LlmThinkingMode;
  toggleThinking: () => void;
  /** whether note retrieval (RAG) is enabled for new messages */
  useRag: boolean;
  toggleRag: () => void;
  restoredMessages: Message[] | null;
  restored: boolean;
  restoreError: boolean;
  retryRestore: () => void;
  /** true when the server still owns generation for a reopened session */
  backgroundLoading: boolean;
  backgroundGenerationId: string | null;
  /** keep refs in sync so unload handlers see fresh values */
  updateRefs: (refs: PersistenceRefs) => void;
}

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: unknown;
  sources?: { id: string; title: string }[];
  metadata?: {
    thinking?: unknown;
    thinkingDuration?: unknown;
    partial?: unknown;
    error?: unknown;
  };
  created_at?: string;
  rating?: number | null;
};

export interface ChatSessionSnapshot {
  messages: Message[];
  generating: boolean;
  activeGenerationId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storedMessageFrom(value: unknown): StoredMessage | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string"
  ) {
    return null;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((source) =>
        isRecord(source) &&
        typeof source.id === "string" &&
        typeof source.title === "string"
          ? [{ id: source.id, title: source.title }]
          : [],
      )
    : undefined;

  return {
    id: value.id,
    role: value.role,
    content: value.content,
    parts: value.parts,
    sources,
    metadata,
    created_at:
      typeof value.created_at === "string" ? value.created_at : undefined,
    rating:
      typeof value.rating === "number" || value.rating === null
        ? value.rating
        : undefined,
  };
}

/** Fetch the durable PostgreSQL-backed view of a chat session. */
export async function fetchChatSessionSnapshot(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatSessionSnapshot> {
  const response = await fetch(`/api/chat/sessions/${sessionId}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Unable to restore conversation (${response.status})`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.messages)) {
    throw new Error("Invalid conversation response");
  }

  const session = isRecord(data.session) ? data.session : {};
  const generating = session.generation_status === "generating";
  return {
    messages: mapStoredChatMessages(data.messages),
    generating,
    activeGenerationId:
      generating && typeof session.active_generation_id === "string"
        ? session.active_generation_id
        : null,
  };
}

export function mapStoredChatMessages(messages: unknown[]): Message[] {
  return messages.flatMap((value) => {
    const m = storedMessageFrom(value);
    if (!m) return [];
    const parts = normalizeMessageParts(m.parts) ??
      (m.content ? [{ type: "text" as const, text: m.content }] : []);
    const metadata = m.metadata ?? {};
    return [{
      id: m.id,
      role: m.role,
      content: m.content,
      parts,
      thinking:
        typeof metadata.thinking === "string" ? metadata.thinking : undefined,
      thinkingDuration:
        typeof metadata.thinkingDuration === "number"
          ? metadata.thinkingDuration
          : undefined,
      partial: metadata.partial === true,
      error: typeof metadata.error === "string" ? metadata.error : undefined,
      sources: Array.isArray(m.sources) ? m.sources : [],
      timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      rating: m.rating ?? null,
    }];
  });
}

/**
 * Manages thinking mode persistence (localStorage) and
 * session restore + draft save/restore (sessionStorage).
 */
export function useChatPersistence(
  options: UseChatPersistenceOptions,
): UseChatPersistenceResult {
  const { controlledSessionId } = options;

  // thinking mode
  const [thinkingMode, setThinkingMode] = useState<LlmThinkingMode>("auto");

  // Toggle normal high-effort reasoning on or off.
  const toggleThinking = useCallback(() => {
    setThinkingMode(nextLlmThinkingMode);
  }, []);

  // restore thinking mode from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(THINKING_MODE_KEY);
    setThinkingMode(saved === "off" ? "off" : "auto");
  }, []);

  // persist thinking mode changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THINKING_MODE_KEY, thinkingMode);
  }, [thinkingMode]);

  // note retrieval (RAG) toggle — defaults on
  const [useRag, setUseRag] = useState<boolean>(true);

  const toggleRag = useCallback(() => {
    setUseRag((current) => !current);
  }, []);

  // restore RAG preference from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(USE_RAG_KEY);
    setUseRag(saved === null ? true : saved !== "false");
  }, []);

  // persist RAG preference changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(USE_RAG_KEY, String(useRag));
  }, [useRag]);

  // session restore
  const [restored, setRestored] = useState(false);
  const [restoredMessages, setRestoredMessages] = useState<Message[] | null>(null);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [backgroundGenerationId, setBackgroundGenerationId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const retryRestore = useCallback(() => {
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!controlledSessionId) {
      setRestoredMessages(null);
      setBackgroundLoading(false);
      setBackgroundGenerationId(null);
      setRestoreError(false);
      setRestored(true);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let firstLoad = true;
    const controller = new AbortController();

    setRestored(false);
    setRestoreError(false);
    setRestoredMessages(null);
    setBackgroundLoading(false);
    setBackgroundGenerationId(null);

    const restore = async (): Promise<void> => {
      try {
        const snapshot = await fetchChatSessionSnapshot(
          controlledSessionId,
          controller.signal,
        );
        if (cancelled) return;
        setRestoreError(false);
        setRestored(true);
        setBackgroundLoading(snapshot.generating);
        setBackgroundGenerationId(snapshot.activeGenerationId);

        // check sessionStorage for a partial assistant message saved on unload
        const draftKey = `chat-draft:${controlledSessionId}`;
        let draftMsg: Message | null = null;
        try {
          const raw = sessionStorage.getItem(draftKey);
          if (firstLoad && !snapshot.generating && raw) {
            const draft = JSON.parse(raw) as {
              content: string;
              thinking?: string;
              sources?: { id: string; title: string }[];
              timestamp: number;
            };
            const alreadyHas = snapshot.messages.some(
              (m) => m.role === "assistant" && m.timestamp >= draft.timestamp,
            );
            if (!alreadyHas && draft.content) {
              draftMsg = {
                id: `draft-${Date.now()}`,
                role: "assistant",
                content: `${draft.content}\n\n*[partial — response was interrupted]*`,
                thinking: draft.thinking,
                sources: draft.sources ?? [],
                timestamp: draft.timestamp,
              };
            }
            sessionStorage.removeItem(draftKey);
          }
        } catch {
          // malformed draft or storage unavailable
        }

        setRestoredMessages([
          ...snapshot.messages,
          ...(draftMsg ? [draftMsg] : []),
        ]);
        firstLoad = false;
        if (snapshot.generating) {
          pollTimer = setTimeout(() => void restore(), 1_500);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        logChatPersistence("session restore failed", {
          sessionId: controlledSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        setRestored(false);
        setRestoreError(true);
        setBackgroundLoading(false);
        setBackgroundGenerationId(null);
      }
    };
    void restore();
    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [controlledSessionId, restoreAttempt]);

  // refs for unload handlers (kept in sync by the consumer)
  const messagesRef = useRef<Message[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const updateRefs = useCallback((refs: PersistenceRefs) => {
    messagesRef.current = refs.messages;
    sessionIdRef.current = refs.sessionId;
    loadingRef.current = refs.loading;
  }, []);

  // save partial draft on unload / visibility change
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saveDraft = () => {
      if (!loadingRef.current) return;
      const sid = sessionIdRef.current;
      if (!sid) {
        logChatPersistence("skipped draft save without session id");
        return;
      }
      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant" || !last.content) {
        logChatPersistence("skipped draft save without assistant content", {
          hasLastMessage: Boolean(last),
          lastRole: last?.role,
        });
        return;
      }

      const draft = {
        content: last.content,
        thinking: last.thinking,
        sources: last.sources,
        timestamp: last.timestamp,
      };
      try {
        sessionStorage.setItem(`chat-draft:${sid}`, JSON.stringify(draft));
        logChatPersistence("saved partial draft", {
          sessionId: sid,
          contentLength: last.content.length,
          hasThinking: Boolean(last.thinking),
        });
      } catch {
        logChatPersistence("failed to save partial draft", {
          sessionId: sid,
          contentLength: last.content.length,
        });
        // sessionStorage quota exceeded or unavailable
      }
    };

    const handleBeforeUnload = () => {
      logChatPersistence("beforeunload while streaming", {
        loading: loadingRef.current,
      });
      saveDraft();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        logChatPersistence("document hidden while streaming", {
          loading: loadingRef.current,
        });
        saveDraft();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return {
    thinkingMode,
    toggleThinking,
    useRag,
    toggleRag,
    restoredMessages,
    restored,
    restoreError,
    retryRestore,
    backgroundLoading,
    backgroundGenerationId,
    updateRefs,
  };
}
