"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import ChatInterface from "@/components/chat/chat-interface";
import {
  ConversationHistory,
  type ConversationHistoryProps,
} from "@/components/chat/conversation-history";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildChatSessionHref, buildNewChatHref } from "@/lib/chat/routes";
import { forgetSidebarChatSession } from "@/lib/chat/sidebar-session";

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
  pinned: boolean;
}

interface ContextItem {
  id: string;
  title: string;
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
}

export default function ChatPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
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
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeConv = conversations.find((c) => c.id === activeId);

  useEffect(() => {
    setActiveId(routeSessionId);
  }, [routeSessionId]);

  useEffect(() => {
    const notes: ContextItem[] = paramNoteIds.map((id, i) => ({
      id,
      title: paramNoteTitles[i] || t("Untitled"),
    }));
    const folders: ContextItem[] = paramFolderIds.map((id, i) => ({
      id,
      title: paramFolderTitles[i] || t("Folder"),
    }));
    setSelectedNotes(notes);
    setSelectedFolders(folders);
  }, [paramNoteIds, paramNoteTitles, paramFolderIds, paramFolderTitles, t]);

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
          pinned: Boolean(s.pinned),
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
    setHistoryOpen(false);
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
            pinned: false,
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
    forgetSidebarChatSession(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setHistoryOpen(false);
      setMountKey((prev) => prev + 1);
      setActiveId(null);
      router.replace(draftHref);
    }
  };

  const updateConversation = async (
    id: string,
    changes: { title?: string; pinned?: boolean },
  ): Promise<boolean> => {
    const res = await fetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) return false;
    const updated = await res.json();
    setConversations((prev) =>
      sortConversations(
        prev.map((conversation) =>
          conversation.id === id
            ? {
                ...conversation,
                title: updated.title ?? conversation.title,
                pinned: updated.pinned ?? conversation.pinned,
              }
            : conversation,
        ),
      ),
    );
    return true;
  };

  const contextPrefix =
    selectedFolders.length > 0
      ? t(
          selectedFolders.length === 1 ? "{count} folder" : "{count} folders",
          { count: selectedFolders.length },
        )
      : selectedNotes.length > 0
        ? t(
            selectedNotes.length === 1 ? "{count} file" : "{count} files",
            { count: selectedNotes.length },
          )
        : paramFolderId
          ? t('Folder: "{title}"', { title: paramFolderTitle })
          : paramNoteTitle
            ? t('Note: "{title}"', { title: paramNoteTitle })
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

  const conversationTitle =
    activeConv?.title ??
    (contextPrefix
      ? t("chat.about_context", { context: contextPrefix })
      : t("chat.new_conversation"));

  const selectConversation = (id: string) => {
    setHistoryOpen(false);
    setMountKey((prev) => prev + 1);
    setActiveId(id);
  };

  const historyProps: Omit<ConversationHistoryProps, "showHeader"> = {
    conversations,
    activeId,
    loaded,
    t,
    onNewConversation: newConversation,
    onSelectConversation: selectConversation,
    onDeleteConversation: (id) => void deleteConversation(id),
    onRenameConversation: (id, title) => updateConversation(id, { title }),
    onTogglePinned: (id, pinned) => updateConversation(id, { pinned }),
    onDismiss: () => setHistoryOpen(false),
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-app-page text-text">
      <MobileAppHeader
        title={conversationTitle}
        actions={
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            aria-label={t("Chat history")}
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isDesktop === true && (
          <div className="w-12 shrink-0 overflow-hidden border-r border-border-subtle bg-background">
            <PrimaryNavigation />
          </div>
        )}

        {isDesktop === true && (
          <aside className="w-64 flex-shrink-0 overflow-hidden border-r border-border-subtle">
            <ConversationHistory {...historyProps} />
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="glass-panel hidden min-h-[52px] flex-shrink-0 items-center border-b border-border-subtle px-5 md:flex">
            <h1 className="truncate text-sm font-medium text-text-secondary">
              {conversationTitle}
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
            className="min-h-0 flex-1"
          />
        </main>
      </div>

      {isDesktop === false && (
        <MobileDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title={t("chat.title")}
          side="left"
          className="md:hidden"
        >
          <ConversationHistory {...historyProps} showHeader={false} />
        </MobileDrawer>
      )}
    </div>
  );
}
