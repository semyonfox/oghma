"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import BrandLogo from "@/components/brand-logo";

export interface ConversationHistoryConversation {
  id: string;
  title: string;
  createdAt: number;
  pinned: boolean;
}

export interface ConversationHistoryProps {
  conversations: ConversationHistoryConversation[];
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
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function ConversationHistory({
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
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const cancelRenameRef = useRef(false);
  const pinnedConversations = conversations.filter(
    (conversation) => conversation.pinned,
  );
  const recentConversations = conversations.filter(
    (conversation) => !conversation.pinned,
  );

  const beginRename = (conversation: ConversationHistoryConversation) => {
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
    const original = conversations.find(
      (conversation) => conversation.id === editingId,
    );
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
            <BrandLogo
              size={20}
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

      <nav className="flex min-h-0 flex-1 flex-col overflow-hidden pb-3 pt-1">
        {[
          { label: "Pinned", items: pinnedConversations },
          { label: "Recent", items: recentConversations },
        ].map((section) => {
          if (section.items.length === 0) return null;

          const isPinned = section.label === "Pinned";
          const hasBothSections =
            pinnedConversations.length > 0 && recentConversations.length > 0;
          const sectionOpen = !isPinned || pinnedOpen;

          return (
            <section
              key={section.label}
              className={`flex min-h-0 flex-col ${isPinned ? (hasBothSections ? (pinnedOpen ? "max-h-[35%] shrink-0 border-b border-border-subtle/70 pb-2" : "shrink-0 border-b border-border-subtle/70 pb-1") : pinnedOpen ? "flex-1" : "shrink-0") : "flex-1 pt-1"}`}
            >
              {isPinned ? (
                <h3 className="shrink-0 px-1.5">
                  <button
                    type="button"
                    onClick={() => setPinnedOpen((open) => !open)}
                    className="flex h-7 w-full items-center rounded-radius-sm px-2 text-[10px] font-semibold text-text-tertiary/80 transition-colors hover:bg-subtle/70 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-400/40"
                    aria-expanded={pinnedOpen}
                    aria-controls="pinned-conversations"
                  >
                    <span className="flex-1 text-left">{t("Pinned")}</span>
                    <span className="mr-1 tabular-nums text-text-tertiary/60">
                      {pinnedConversations.length}
                    </span>
                    <ChevronDownIcon
                      className={`h-3 w-3 transition-transform ${pinnedOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
              ) : (
                hasBothSections && (
                  <h3 className="flex h-7 shrink-0 items-center px-3.5 text-[10px] font-semibold text-text-tertiary/80">
                    {t("Recent")}
                  </h3>
                )
              )}
              {sectionOpen && (
                <div
                  id={isPinned ? "pinned-conversations" : undefined}
                  className="obsidian-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5"
                >
                  {section.items.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group relative min-h-11 overflow-hidden rounded-radius-sm text-xs transition-colors md:min-h-8 ${conv.id === activeId ? "bg-subtle text-text-secondary" : "text-text-tertiary hover:bg-subtle/70 hover:text-text-secondary"} focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary-400/30`}
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
                            onChange={(event) =>
                              setEditTitle(event.target.value)
                            }
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
                          aria-current={
                            conv.id === activeId ? "page" : undefined
                          }
                        >
                          {conv.pinned && (
                            <PushPinIcon className="h-3 w-3 shrink-0 text-primary-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium md:text-xs md:font-normal">
                            {conv.title}
                          </span>
                        </Link>
                      )}
                      {editingId !== conv.id && (
                        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-14 items-center justify-end pr-2 md:flex">
                          <span
                            className="text-xs text-text-tertiary opacity-70 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
                            suppressHydrationWarning
                          >
                            {relativeDate(conv.createdAt, t)}
                          </span>
                        </div>
                      )}
                      {editingId !== conv.id && (
                        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 px-1 opacity-100 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              void onTogglePinned(conv.id, !conv.pinned)
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-primary-400 md:h-7 md:w-7"
                            title={
                              conv.pinned ? t("Unpin") : t("Pin to favorites")
                            }
                            aria-label={
                              conv.pinned ? t("Unpin") : t("Pin to favorites")
                            }
                          >
                            <PushPinIcon
                              className={`h-3.5 w-3.5 ${conv.pinned ? "text-primary-400" : ""}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => beginRename(conv)}
                            className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-text-secondary md:h-7 md:w-7"
                            title={t("Rename")}
                            aria-label={t("Rename")}
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteConversation(conv.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-radius-sm text-text-tertiary hover:text-error-400 md:h-7 md:w-7"
                            title={t("chat.delete_conversation")}
                            aria-label={t("chat.delete_conversation")}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {loaded && conversations.length === 0 && (
          <p className="py-4 text-center text-xs text-text-tertiary">
            {t("chat.no_conversations")}
          </p>
        )}
      </nav>
    </div>
  );
}
