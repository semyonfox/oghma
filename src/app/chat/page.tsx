"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SparklesIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import ChatInterface from "@/components/chat/chat-interface";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface Conversation {
  id: string;
  title: string;
  noteId?: string;
  noteTitle?: string;
  folderId?: string;
  folderTitle?: string;
  messageCount: number;
  createdAt: number;
}

function ChatPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const paramNoteId = searchParams.get("noteId") ?? undefined;
  const paramNoteTitle = searchParams.get("noteTitle") ?? undefined;
  const paramFolderId = searchParams.get("folderId") ?? undefined;
  const paramFolderTitle = searchParams.get("folderTitle") ?? undefined;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const activeConv = conversations.find((c) => c.id === activeId);

  // load existing sessions from DB
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sessions) && data.sessions.length) {
        const mapped: Conversation[] = data.sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          noteId: s.note_id ?? undefined,
          messageCount: s.message_count ?? 0,
          createdAt: new Date(s.created_at).getTime(),
        }));
        setConversations(mapped);
        // auto-select: if a noteId param matches an existing session, pick it
        if (paramNoteId) {
          const match = mapped.find((c) => c.noteId === paramNoteId);
          if (match) {
            setActiveId(match.id);
            setLoaded(true);
            return;
          }
        }
        // otherwise select the most recent
        if (!activeId) setActiveId(mapped[0].id);
      }
    } catch {
      // network error — fine, user can start a new chat
    } finally {
      setLoaded(true);
    }
  }, [paramNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // start a new conversation (no DB row yet — created on first message)
  const newConversation = () => {
    setActiveId(null);
  };

  // called by ChatInterface when a new session is created server-side
  const handleSessionCreated = useCallback(
    (sessionId: string, title: string) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === sessionId)) return prev;
        return [
          {
            id: sessionId,
            title,
            noteId: paramNoteId,
            noteTitle: paramNoteTitle,
            messageCount: 1,
            createdAt: Date.now(),
          },
          ...prev,
        ];
      });
      setActiveId(sessionId);
    },
    [paramNoteId, paramNoteTitle],
  );

  const deleteConversation = async (id: string) => {
    const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(conversations.find((c) => c.id !== id)?.id ?? null);
    }
  };

  const contextPrefix = paramFolderId
    ? `Folder: "${paramFolderTitle}"`
    : paramNoteTitle
      ? `Note: "${paramNoteTitle}"`
      : null;

  return (
    <div className="h-screen w-screen flex bg-chat-page text-text overflow-hidden">
      {/* ── left sidebar ───────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border-subtle bg-surface/95 backdrop-blur">
        {/* header */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border-subtle">
          <Link
            href="/notes"
            className="p-1.5 rounded text-text-tertiary hover:text-text-secondary hover:bg-subtle transition-colors"
            title={t("chat.back_to_notes")}
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <SparklesIcon className="w-4 h-4 text-primary-400 flex-shrink-0" />
            <span className="text-sm font-medium text-text-secondary truncate">
              {t("chat.title")}
            </span>
          </div>
          <Link href="/" className="flex-shrink-0">
            <img
              src="/oghmanotes.svg"
              alt="OghmaNotes"
              className="w-5 h-5 opacity-60 hover:opacity-100 transition-opacity"
            />
          </Link>
        </div>

        {/* new conversation button */}
        <div className="px-3 py-3">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-tertiary bg-subtle border border-border-subtle hover:bg-subtle-hover hover:text-text-secondary transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t("chat.new_conversation")}
          </button>
        </div>

        {/* conversation list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 obsidian-scrollbar">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={`group w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                conv.id === activeId
                  ? "bg-primary-500/15 border border-primary-500/25 text-text-secondary"
                  : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="font-medium truncate text-[13px] flex-1">
                  {conv.title}
                </p>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConversation(conv.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void deleteConversation(conv.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-error-400 transition-all flex-shrink-0"
                  title={t("chat.delete_conversation")}
                >
                  <TrashIcon className="w-3 h-3" />
                </span>
              </div>
              {conv.noteTitle && (
                <div className="flex items-center gap-1 mt-0.5 text-text-tertiary">
                  <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{conv.noteTitle}</span>
                </div>
              )}
              <p className="text-text-tertiary opacity-60 mt-0.5">
                {new Date(conv.createdAt).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </button>
          ))}
          {loaded && conversations.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-4">
              {t("chat.no_conversations")}
            </p>
          )}
        </nav>

        {/* footer */}
        <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
          <Link
            href="/settings"
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {t("chat.configure_ai")}
          </Link>
        </div>
      </aside>

      {/* ── main chat area ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* top bar */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-surface/55 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-medium text-text-secondary truncate">
              {activeConv?.title ??
                (contextPrefix
                  ? t("chat.about_context", { context: contextPrefix })
                  : t("chat.new_conversation"))}
            </h1>
            {(activeConv?.noteId || paramNoteId) && (
              <a
                href={`/notes/${activeConv?.noteId ?? paramNoteId}`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <DocumentTextIcon className="w-3 h-3" />
                <span className="truncate max-w-[150px]">
                  {activeConv?.noteTitle ?? paramNoteTitle}
                </span>
              </a>
            )}
            {paramFolderId && !activeConv?.noteId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary-500/20 bg-primary-500/10 text-[11px] text-primary-400">
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="truncate max-w-[150px]">
                  {paramFolderTitle}
                </span>
                <span className="text-primary-500/60 ml-0.5">
                  · {t("chat.rag_coming_soon")}
                </span>
              </span>
            )}
          </div>
        </header>

        {/* chat — key forces a fresh component when conversation changes */}
        <ChatInterface
          key={activeId ?? "new"}
          sessionId={activeId ?? undefined}
          noteId={activeConv?.noteId ?? paramNoteId}
          noteTitle={activeConv?.noteTitle ?? paramNoteTitle}
          onSessionCreated={handleSessionCreated}
          className="flex-1 min-h-0"
        />
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-chat-page">
          <SparklesIcon className="w-8 h-8 text-primary-400 animate-pulse" />
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
