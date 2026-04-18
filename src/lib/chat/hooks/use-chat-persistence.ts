"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "@/lib/chat/types";
import type { LlmThinkingMode } from "@/lib/ai-config";

const THINKING_MODE_KEY = "chat-thinking-mode";

interface PersistenceRefs {
  messages: Message[];
  sessionId: string | null;
  loading: boolean;
}

interface UseChatPersistenceOptions {
  compact: boolean;
  controlledSessionId?: string;
  welcomeMessage: string;
}

interface UseChatPersistenceResult {
  thinkingMode: LlmThinkingMode;
  toggleThinking: () => void;
  restoredMessages: Message[] | null;
  restored: boolean;
  /** keep refs in sync so unload handlers see fresh values */
  updateRefs: (refs: PersistenceRefs) => void;
}

/**
 * Manages thinking mode persistence (localStorage) and
 * session restore + draft save/restore (sessionStorage).
 */
export function useChatPersistence(
  options: UseChatPersistenceOptions,
): UseChatPersistenceResult {
  const { compact, controlledSessionId, welcomeMessage } = options;

  // thinking mode
  const [thinkingMode, setThinkingMode] = useState<LlmThinkingMode>("auto");

  const toggleThinking = useCallback(() => {
    setThinkingMode((current) => (current === "off" ? "on" : "off"));
  }, []);

  // restore thinking mode from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(THINKING_MODE_KEY);
    if (saved === "on" || saved === "off" || saved === "auto") {
      setThinkingMode(saved);
    }
  }, []);

  // persist thinking mode changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THINKING_MODE_KEY, thinkingMode);
  }, [thinkingMode]);

  // session restore
  const [restored, setRestored] = useState(false);
  const [restoredMessages, setRestoredMessages] = useState<Message[] | null>(null);

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
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;

        const serverMessages: Message[] = data.messages.map(
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

        // check sessionStorage for a partial assistant message saved on unload
        const draftKey = `chat-draft:${controlledSessionId}`;
        let draftMsg: Message | null = null;
        try {
          const raw = sessionStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw) as {
              content: string;
              thinking?: string;
              sources?: { id: string; title: string }[];
              timestamp: number;
            };
            const alreadyHas = serverMessages.some(
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
          ...serverMessages,
          ...(draftMsg ? [draftMsg] : []),
        ]);
      } catch {
        // fresh session is fine
      } finally {
        setRestored(true);
      }
    };
    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledSessionId, compact, restored]);

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
      if (!sid) return;
      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant" || !last.content) return;

      const draft = {
        content: last.content,
        thinking: last.thinking,
        sources: last.sources,
        timestamp: last.timestamp,
      };
      try {
        sessionStorage.setItem(`chat-draft:${sid}`, JSON.stringify(draft));
      } catch {
        // sessionStorage quota exceeded or unavailable
      }
    };

    const handleBeforeUnload = () => saveDraft();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveDraft();
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
    restoredMessages,
    restored,
    updateRefs,
  };
}
