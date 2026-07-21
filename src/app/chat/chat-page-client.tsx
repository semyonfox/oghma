"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SparklesIcon,
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import ChatInterface from "@/components/chat/chat-interface";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import useMediaQuery from "@/lib/hooks/use-media-query";
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
  pinned: boolean;
}

interface ContextItem {
  id: string;
  title: string;
}

function PushPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8 3 1.5 2v5L7 13v1h10v-1l-2.5-3V5L16 3H8Zm4 11v7"
      />
    </svg>
  );
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
}

function relativeDate(
  ms: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{count}m ago", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("{count}h ago", { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("{count}d ago", { count: d });
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

interface ConversationHistoryProps {
  conversations: Conversation[];
  activeId: string | null;
  loaded: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => Promise<boolean>;
  onTogglePinned: (id: string, pinned: boolean) => Promise<boolean>;
  onDismiss: () => void;
  showHeader?: boolean;
}

function ConversationHistory({
  conversations,
  activeId,
  loaded,
  t,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinned,
  onDismiss,
  showHeader = true,
}: ConversationHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const cancelRenameRef = useRef(false);
  const pinnedConversations = conversations.filter((conversation) => conversation.pinned);
  const recentConversations = conversations.filter((conversation) => !conversation.pinned);

  const beginRename = (conversation: Conversation) => {
    cancelRenameRef.current = false;
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const finishRename = async () => {
    if (!editingId) return;
    const title = editTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    const original = conversations.find((conversation) => conversation.id === editingId);
    if (original?.title === title) {
      setEditingId(null);
      return;
    }
    if (await onRenameConversation(editingId, title)) setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden glass-panel">
      {showHeader && (
        <div className="flex min-h-[52px] items-center gap-2 border-b border-border-subtle px-3 py-2">
          <Link
            href="/notes"
            onClick={onDismiss}
            className="flex h-9 w-9 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary"
            title={t("chat.back_to_notes")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SparklesIcon className="h-4 w-4 flex-shrink-0 text-primary-400" />
            <span className="truncate text-sm font-medium text-text-secondary">
              {t("chat.title")}
            </span>
          </div>
          <Link href="/" onClick={onDismiss} className="flex-shrink-0">
            <img
              src="/oghmanotes.svg"
              alt="OghmaNotes"
              className="h-5 w-5 opacity-60 transition-opacity hover:opacity-100"
            />
          </Link>
        </div>
      )}

      <div className="px-2 pb-2 pt-2.5">
        <button
          type="button"
          onClick={onNewConversation}
          className="glass-card-interactive flex h-11 w-full items-center gap-2 rounded-radius-md px-3 text-sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400/30 md:h-9 md:text-xs"
        >
          <PlusIcon className="h-4 w-4" />
          {t("chat.new_conversation")}
        </button>
      </div>

      <nav className="obsidian-scrollbar flex-1 overflow-y-auto px-1.5 pb-3 pt-1">
        {[
          { label: "Pinned", items: pinnedConversations },
          { label: "Recent", items: recentConversations },
        ].map((section) => section.items.length > 0 && (
          <section key={section.label} className={section.label === "Pinned" ? "mb-2.5" : ""}>
            {section.label === "Pinned" && (
              <h3 className="flex h-6 items-center gap-0.5 px-2 text-[10px] font-semibold text-text-tertiary/80">
                {t("Pinned")}
                <ChevronDownIcon className="h-2.5 w-2.5" aria-hidden="true" />
              </h3>
            )}
            <div className="space-y-0.5">
            {section.items.map((conv) => (
          <div
            key={conv.id}
            className={`group relative min-h-11 overflow-hidden rounded-radius-sm text-xs transition-colors md:min-h-8 ${
              conv.id === activeId
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle/70 hover:text-text-secondary"
            } focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary-400/30`}
          >
            {editingId === conv.id ? (
              <form
                className="flex min-h-11 items-center gap-1 px-1.5 md:min-h-8"
                onSubmit={(event) => {
                  event.preventDefault();
                  void finishRename();
                }}
              >
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRenameRef.current = true;
                      setEditingId(null);
                    }
                  }}
                  onBlur={() => {
                    if (cancelRenameRef.current) {
                      cancelRenameRef.current = false;
                      return;
                    }
                    void finishRename();
                  }}
                  className="h-8 min-w-0 flex-1 rounded-radius-sm border border-primary-500/40 bg-surface px-2 text-xs text-text-secondary outline-none ring-1 ring-primary-500/20"
                  aria-label={t("Rename")}
                  autoFocus
                />
              </form>
            ) : (
              <Link
                href={`/chat/${conv.id}`}
                onClick={() => onSelectConversation(conv.id)}
                className="flex min-h-11 w-full items-center gap-1.5 px-2.5 pr-32 text-left transition-[padding] duration-150 focus-visible:outline-none md:min-h-8 md:pr-16 md:group-hover:pr-28 md:group-focus-within:pr-28"
                aria-current={conv.id === activeId ? "page" : undefined}
              >
                {conv.pinned && <PushPinIcon className="h-3 w-3 shrink-0 text-primary-400" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium md:text-xs md:font-normal">{conv.title}</span>
              </Link>
            )}

            {editingId !== conv.id && <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-14 items-center justify-end pr-2 md:flex">
              <span
                className="text-xs text-text-tertiary opacity-70 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
                suppressHydrationWarning
              >
                {relativeDate(conv.createdAt, t)}
              </span>
            </div>}

            {editingId !== conv.id && (
              <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 px-1 opacity-100 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                <button type="button" onClick={() => void onTogglePinned(conv.id, !conv.pinned)} className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-primary-400 md:h-7 md:w-7" title={conv.pinned ? t("Unpin") : t("Pin to favorites")} aria-label={conv.pinned ? t("Unpin") : t("Pin to favorites")}>
                  <PushPinIcon className={`h-3.5 w-3.5 ${conv.pinned ? "text-primary-400" : ""}`} />
                </button>
                <button type="button" onClick={() => beginRename(conv)} className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-text-secondary md:h-7 md:w-7" title={t("Rename")} aria-label={t("Rename")}>
                  <PencilSquareIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onDeleteConversation(conv.id)} className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-error-400 md:h-7 md:w-7" title={t("chat.delete_conversation")} aria-label={t("chat.delete_conversation")}>
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
            ))}
            </div>
          </section>
        ))}
        {loaded && conversations.length === 0 && (
          <p className="py-4 text-center text-xs text-text-tertiary">
            {t("chat.no_conversations")}
          </p>
        )}
      </nav>

    </div>
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
            <ConversationHistory
              conversations={conversations}
              activeId={activeId}
              loaded={loaded}
              t={t}
              onNewConversation={newConversation}
              onSelectConversation={selectConversation}
              onDeleteConversation={(id) => void deleteConversation(id)}
              onRenameConversation={(id, title) =>
                updateConversation(id, { title })
              }
              onTogglePinned={(id, pinned) =>
                updateConversation(id, { pinned })
              }
              onDismiss={() => setHistoryOpen(false)}
            />
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
          <ConversationHistory
            conversations={conversations}
            activeId={activeId}
            loaded={loaded}
            t={t}
            onNewConversation={newConversation}
            onSelectConversation={selectConversation}
            onDeleteConversation={(id) => void deleteConversation(id)}
            onRenameConversation={(id, title) =>
              updateConversation(id, { title })
            }
            onTogglePinned={(id, pinned) =>
              updateConversation(id, { pinned })
            }
            onDismiss={() => setHistoryOpen(false)}
            showHeader={false}
          />
        </MobileDrawer>
      )}
    </div>
  );
}
