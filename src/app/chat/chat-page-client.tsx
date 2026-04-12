"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(routeSessionId);
  const [loaded, setLoaded] = useState(false);
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
    setActiveId(null);
    router.push(draftHref);
  }, [draftHref, router]);

  const clearContextAndStartNewChat = useCallback(() => {
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
      router.replace(buildChatSessionHref(sessionId, draftRouteContext));
    },
    [
      draftRouteContext,
      paramNoteId,
      paramNoteTitle,
      router,
      selectedFolders.length,
      selectedNotes,
    ],
  );

  const deleteConversation = async (id: string) => {
    const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
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

  const chatInstanceKey =
    activeId ??
    [
      "new",
      paramNoteId ?? "",
      paramFolderId ?? "",
      selectedNotes.map((note) => note.id).join(","),
      selectedFolders.map((folder) => folder.id).join(","),
    ].join(":");

  return (
    <div className="h-screen w-screen flex bg-app-page text-text overflow-hidden">
      <div className="w-12 shrink-0 bg-background border-r border-border-subtle overflow-hidden">
        <IconNav />
      </div>

      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border-subtle glass-panel overflow-hidden">
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

        <div className="px-3 py-3">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-tertiary glass-card-interactive hover:text-text-secondary transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t("chat.new_conversation")}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 obsidian-scrollbar">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveId(conv.id);
                router.push(`/chat/${conv.id}`);
              }}
              className={`group w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                conv.id === activeId
                  ? "glass-card-active text-text-secondary"
                  : "glass-card-interactive text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="font-medium truncate text-sm flex-1">
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

        <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
          <Link
            href="/settings"
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {t("chat.configure_ai")}
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border-subtle glass-panel">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-medium text-text-secondary truncate">
              {activeConv?.title ??
                (contextPrefix
                  ? t("chat.about_context", { context: contextPrefix })
                  : t("chat.new_conversation"))}
            </h1>
            {(activeConv?.noteId || paramNoteId) &&
              selectedNotes.length === 0 &&
              selectedFolders.length === 0 && (
                <a
                  href={`/notes/${activeConv?.noteId ?? paramNoteId}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  <DocumentTextIcon className="w-3 h-3" />
                  <span className="truncate max-w-[150px]">
                    {activeConv?.noteTitle ?? paramNoteTitle}
                  </span>
                </a>
              )}
            {selectedNotes.map((note) => (
              <span
                key={`note-${note.id}`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-subtle text-xs text-text-tertiary"
              >
                <DocumentTextIcon className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{note.title}</span>
                <button
                  onClick={() => removeSelectedNote(note.id)}
                  className="text-text-tertiary hover:text-text-secondary"
                  title="Remove file"
                >
                  ×
                </button>
              </span>
            ))}
            {selectedFolders.map((folder) => (
              <span
                key={`folder-${folder.id}`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary-500/20 bg-primary-500/10 text-xs text-primary-400"
              >
                <span className="truncate max-w-[120px]">{folder.title}</span>
                <button
                  onClick={() => removeSelectedFolder(folder.id)}
                  className="text-primary-500/70 hover:text-primary-300"
                  title="Remove folder"
                >
                  ×
                </button>
              </span>
            ))}
            {(selectedNotes.length > 0 || selectedFolders.length > 0) && (
              <button
                onClick={clearSelection}
                className="text-xs text-text-tertiary hover:text-text-secondary"
                title="Clear selected context"
              >
                clear
              </button>
            )}
          </div>
        </header>

        <ChatInterface
          key={chatInstanceKey}
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
          className="flex-1 min-h-0"
        />
      </main>
    </div>
  );
}
