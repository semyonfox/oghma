"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SparklesIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import ChatInterface from "@/components/chat/chat-interface";
import IconNav from "@/components/sidebar/icon-nav";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildChatSessionHref, buildNewChatHref } from "@/lib/chat/routes";

interface Conversation {
  id: string;
  title: string;
  noteId?: string;
  noteTitle?: string;
  context?: {
    scope?: {
      notes?: ContextItem[];
      folders?: ContextItem[];
    };
  };
  messageCount: number;
  createdAt: number;
}

interface ContextItem {
  id: string;
  title: string;
}

function relativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const searchParams = useSearchParams();
  const routeSessionId =
    typeof params?.sessionId === "string" ? params.sessionId : null;

  const { paramNoteIds, paramNoteTitles, paramFolderIds, paramFolderTitles } =
    useMemo(
      () => ({
        paramNoteIds: searchParams.getAll("noteId").filter(Boolean),
        paramNoteTitles: searchParams.getAll("noteTitle"),
        paramFolderIds: searchParams.getAll("folderId").filter(Boolean),
        paramFolderTitles: searchParams.getAll("folderTitle"),
      }),
      [searchParams],
    );
  const paramNoteId = paramNoteIds[0] ?? undefined;
  const paramNoteTitle = paramNoteTitles[0] ?? undefined;
  const paramFolderId = paramFolderIds[0] ?? undefined;
  const paramFolderTitle = paramFolderTitles[0] ?? undefined;
  const hasRouteScope = paramNoteIds.length > 0 || paramFolderIds.length > 0;

  const pendingNavRef = useRef<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(routeSessionId);
  const [loaded, setLoaded] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [selectedNotes, setSelectedNotes] = useState<ContextItem[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<ContextItem[]>([]);

  const activeConv = conversations.find((c) => c.id === activeId);

  useEffect(() => {
    setActiveId(routeSessionId);
  }, [routeSessionId]);

  useEffect(() => {
    const notes: ContextItem[] = paramNoteIds.map((id, i) => ({
      id,
      title: paramNoteTitles[i] || "Untitled",
    }));
    const folders: ContextItem[] = paramFolderIds.map((id, i) => ({
      id,
      title: paramFolderTitles[i] || "Folder",
    }));
    setSelectedNotes(notes);
    setSelectedFolders(folders);
  }, [paramNoteIds, paramNoteTitles, paramFolderIds, paramFolderTitles]);

  useEffect(() => {
    if (!activeId || hasRouteScope || !activeConv?.context?.scope) return;
    setSelectedNotes(activeConv.context.scope.notes ?? []);
    setSelectedFolders(activeConv.context.scope.folders ?? []);
  }, [activeConv, activeId, hasRouteScope]);

  const draftRouteContext = useMemo(
    () => ({
      noteId: paramNoteId,
      noteTitle: paramNoteTitle,
      folderId: paramFolderId,
      folderTitle: paramFolderTitle,
      selectedNotes,
      selectedFolders,
    }),
    [
      paramNoteId,
      paramNoteTitle,
      paramFolderId,
      paramFolderTitle,
      selectedNotes,
      selectedFolders,
    ],
  );

  const draftHref = useMemo(
    () => buildNewChatHref(draftRouteContext),
    [draftRouteContext],
  );

  const syncScopeUrl = useCallback(
    (nextNotes: ContextItem[], nextFolders: ContextItem[]) => {
      const nextContext = {
        noteId: paramNoteId,
        noteTitle: paramNoteTitle,
        folderId: paramFolderId,
        folderTitle: paramFolderTitle,
        selectedNotes: nextNotes,
        selectedFolders: nextFolders,
      };

      const href = activeId
        ? buildChatSessionHref(activeId, nextContext)
        : buildNewChatHref(nextContext);

      if (activeId) {
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === activeId
              ? {
                  ...conversation,
                  noteId:
                    nextNotes.length === 1 && nextFolders.length === 0
                      ? nextNotes[0].id
                      : undefined,
                  noteTitle:
                    nextNotes.length === 1 && nextFolders.length === 0
                      ? nextNotes[0].title
                      : undefined,
                  context: {
                    scope: {
                      notes: nextNotes,
                      folders: nextFolders,
                    },
                  },
                }
              : conversation,
          ),
        );
      }

      router.replace(href);
    },
    [
      activeId,
      paramFolderId,
      paramFolderTitle,
      paramNoteId,
      paramNoteTitle,
      router,
    ],
  );

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sessions)) {
        const mapped: Conversation[] = data.sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          noteId: s.note_id ?? undefined,
          noteTitle: s.note_title ?? undefined,
          context: s.context ?? undefined,
          messageCount: s.message_count ?? 0,
          createdAt: new Date(s.created_at).getTime(),
        }));
        setConversations(mapped);
      }
    } catch {
      // network error — fine, user can start a new chat
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const newConversation = useCallback(() => {
    setMountKey((prev) => prev + 1);
    setActiveId(null);
    router.push(draftHref);
  }, [draftHref, router]);

  const clearContextAndStartNewChat = useCallback(() => {
    setMountKey((prev) => prev + 1);
    setSelectedNotes([]);
    setSelectedFolders([]);
    setActiveId(null);
    router.push("/chat");
  }, [router]);

  const handleSessionCreated = useCallback(
    (sessionId: string, title: string) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === sessionId)) return prev;
        return [
          {
            id: sessionId,
            title,
            noteId:
              selectedNotes.length === 1 && selectedFolders.length === 0
                ? selectedNotes[0].id
                : paramNoteId,
            noteTitle:
              selectedNotes.length === 1 && selectedFolders.length === 0
                ? selectedNotes[0].title
                : paramNoteTitle,
            context: {
              scope: {
                notes: selectedNotes,
                folders: selectedFolders,
              },
            },
            messageCount: 1,
            createdAt: Date.now(),
          },
          ...prev,
        ];
      });
      setActiveId(sessionId);
      // defer URL update to stream completion to avoid remounting mid-stream
      pendingNavRef.current = buildChatSessionHref(sessionId, draftRouteContext);
    },
    [
      draftRouteContext,
      paramNoteId,
      paramNoteTitle,
      selectedFolders,
      selectedNotes,
    ],
  );

  const handleStreamComplete = useCallback(() => {
    void loadSessions();
    if (pendingNavRef.current) {
      router.replace(pendingNavRef.current);
      pendingNavRef.current = null;
    }
  }, [loadSessions, router]);

  const deleteConversation = async (id: string) => {
    const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setMountKey((prev) => prev + 1);
      setActiveId(null);
      router.replace(draftHref);
    }
  };

  const contextPrefix =
    selectedFolders.length > 0
      ? `${selectedFolders.length} folder${selectedFolders.length > 1 ? "s" : ""}`
      : selectedNotes.length > 0
        ? `${selectedNotes.length} file${selectedNotes.length > 1 ? "s" : ""}`
        : paramFolderId
          ? `Folder: "${paramFolderTitle}"`
          : paramNoteTitle
            ? `Note: "${paramNoteTitle}"`
            : null;

  const removeSelectedNote = (id: string) => {
    const nextNotes = selectedNotes.filter((note) => note.id !== id);
    setSelectedNotes(nextNotes);
    syncScopeUrl(nextNotes, selectedFolders);
  };

  const removeSelectedFolder = (id: string) => {
    const nextFolders = selectedFolders.filter((folder) => folder.id !== id);
    setSelectedFolders(nextFolders);
    syncScopeUrl(selectedNotes, nextFolders);
  };

  const clearSelection = () => {
    setSelectedNotes([]);
    setSelectedFolders([]);
    syncScopeUrl([], []);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-app-page text-text">
      <div className="w-12 shrink-0 bg-background border-r border-border-subtle overflow-hidden">
        <IconNav />
      </div>

      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border-subtle glass-panel overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border-subtle">
          <Link
            href="/notes"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-subtle transition-colors"
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

        <div className="px-2 pt-3 pb-2.5 border-t border-border-subtle">
          <button
            onClick={newConversation}
            className="glass-card-interactive flex w-full min-h-[44px] items-center gap-2 rounded-radius-md px-3 py-2 text-sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400/30"
          >
            <PlusIcon className="w-4 h-4" />
            {t("chat.new_conversation")}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 obsidian-scrollbar">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative overflow-hidden rounded-radius-md text-xs transition-colors ${
                conv.id === activeId
                  ? "glass-card-active text-text-secondary"
                  : "glass-card-interactive text-text-tertiary hover:text-text-secondary"
              } focus-within:ring-1 focus-within:ring-primary-400/30`}
            >
              <Link
                href={`/chat/${conv.id}`}
                onClick={() => {
                  setMountKey((prev) => prev + 1);
                  setActiveId(conv.id);
                }}
                className="flex w-full items-start px-3 py-2.5 pr-10 text-left focus-visible:outline-none"
                aria-current={conv.id === activeId ? "page" : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-5">{conv.title}</p>
                  {conv.noteTitle && (
                    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-text-tertiary">
                      <DocumentTextIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="min-w-0 truncate">{conv.noteTitle}</span>
                    </div>
                  )}
                </div>
              </Link>

              <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end pr-1">
                <span
                  className="text-[10px] text-text-tertiary opacity-70 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
                  suppressHydrationWarning
                >
                  {relativeDate(conv.createdAt)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void deleteConversation(conv.id);
                }}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-tertiary opacity-0 translate-x-full pointer-events-none transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto hover:text-error-400"
                title={t("chat.delete_conversation")}
                aria-label={t("chat.delete_conversation")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {loaded && conversations.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-4">
              {t("chat.no_conversations")}
            </p>
          )}
        </nav>

        <div className="flex-shrink-0 border-t border-border-subtle px-3 py-2.5">
          <Link
            href="/settings"
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {t("chat.configure_ai")}
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex-shrink-0 flex items-center px-4 py-2.5 border-b border-border-subtle glass-panel">
          <h1 className="text-sm font-medium text-text-secondary truncate">
            {activeConv?.title ??
              (contextPrefix
                ? t("chat.about_context", { context: contextPrefix })
                : t("chat.new_conversation"))}
          </h1>
        </header>

        <ChatInterface
          key={mountKey}
          sessionId={activeId ?? undefined}
          noteId={
            selectedNotes.length === 1 && selectedFolders.length === 0
              ? selectedNotes[0].id
              : !activeId
                ? paramNoteId
                : undefined
          }
          noteTitle={
            selectedNotes.length === 1 && selectedFolders.length === 0
              ? selectedNotes[0].title
              : !activeId
                ? paramNoteTitle
                : undefined
          }
          selectedNotes={selectedNotes}
          selectedFolders={selectedFolders}
          onSessionCreated={handleSessionCreated}
          onClearContext={clearContextAndStartNewChat}
          onStreamComplete={handleStreamComplete}
          onRemoveNote={removeSelectedNote}
          onRemoveFolder={removeSelectedFolder}
          className="flex-1 min-h-0"
        />
      </main>
    </div>
  );
}
