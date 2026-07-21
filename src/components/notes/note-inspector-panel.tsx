"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore, {
  type RightPanelTab,
} from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { extractTags } from "@/lib/notes/utils/file-spec";
import dynamic from "next/dynamic";
import {
  readSidebarChatSession,
  rememberSidebarChatSession,
} from "@/lib/chat/sidebar-session";
import { buildChatSessionHref, buildNewChatHref } from "@/lib/chat/routes";

const ChatInterface = dynamic(
  () => import("@/components/chat/chat-interface"),
  { ssr: false }
);
const TodoTab = dynamic(
  () => import("@/components/notes/todo-tab"),
  { ssr: false }
);

interface InspectorNote {
  id: string;
  title?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

function NoteSidebarChat({
  noteId,
  noteTitle,
}: {
  noteId: string;
  noteTitle?: string;
}) {
  const { t } = useI18n();
  const [sessionId, setSessionId] = useState<string>();

  useEffect(() => {
    setSessionId(readSidebarChatSession(noteId));
  }, [noteId]);

  const routeContext = { noteId, noteTitle };
  const fullChatHref = sessionId
    ? buildChatSessionHref(sessionId, routeContext)
    : buildNewChatHref(routeContext);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
        <p className="truncate text-xs text-text-tertiary">
          {noteTitle || t("Untitled")}
        </p>
        <a
          href={fullChatHref}
          className="flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
          title={t("Open full chat")}
        >
          {t("Full chat")}
          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
        </a>
      </div>
      <ChatInterface
        compact
        sessionId={sessionId}
        noteId={noteId}
        noteTitle={noteTitle}
        onSessionCreated={(newSessionId) => {
          rememberSidebarChatSession(noteId, newSessionId);
          setSessionId(newSessionId);
        }}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function formatTimestamp(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      timeZoneName: "shortOffset",
    }).format(date),
  };
}

export default function NoteInspectorPanel({
  presentation = "desktop",
}: {
  presentation?: "desktop" | "drawer";
}) {
  const { t } = useI18n();
  const {
    activePane,
    paneA,
    paneB,
    rightPanelOpen,
    toggleRightPanel,
    rightPanelTab,
    setRightPanelTab,
  } = useLayoutStore();
  const activeFile = activePane === "B" && paneB ? paneB : paneA;
  const [note, setNote] = useState<InspectorNote | null>(null);
  const [loading, setLoading] = useState(false);
  // tab state is driven by the layout store so icon-nav and file-view-pane can control it
  const activeTab = rightPanelTab;

  useEffect(() => {
    if (!activeFile?.fileId) {
      setNote(null);
      return;
    }

    let cancelled = false;

    const loadNote = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/notes/${activeFile.fileId}`);
        if (!response.ok) {
          if (!cancelled) setNote(null);
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setNote(data);
        }
      } catch {
        if (!cancelled) setNote(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadNote();

    return () => {
      cancelled = true;
    };
  }, [activeFile?.fileId]);

  const tags = useMemo(() => extractTags(note?.content), [note?.content]);
  const createdTimestamp = useMemo(
    () => formatTimestamp(note?.createdAt),
    [note?.createdAt],
  );
  const updatedTimestamp = useMemo(
    () => formatTimestamp(note?.updatedAt),
    [note?.updatedAt],
  );

  // inline tag editing
  const [newTag, setNewTag] = useState("");
  const [isSavingTag, setIsSavingTag] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(async () => {
    const tag = newTag.trim().replace(/^#/, "");
    if (!tag || !activeFile?.fileId) return;
    setIsSavingTag(true);
    try {
      const tagLine = `#${tag}`;
      const updatedContent = note?.content
        ? `${note.content.trimEnd()}\n${tagLine}\n`
        : `${tagLine}\n`;
      await fetch(`/api/notes/${activeFile.fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedContent }),
      });
      setNote((prev) =>
        prev ? { ...prev, content: updatedContent } : prev,
      );
      setNewTag("");
    } finally {
      setIsSavingTag(false);
    }
  }, [newTag, activeFile?.fileId, note?.content]);

  const removeTag = useCallback(
    async (tagToRemove: string) => {
      if (!activeFile?.fileId || !note?.content) return;
      const updatedContent = note.content
        .split("\n")
        .filter((line) => line.trim() !== `#${tagToRemove}`)
        .join("\n");
      await fetch(`/api/notes/${activeFile.fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedContent }),
      });
      setNote((prev) =>
        prev ? { ...prev, content: updatedContent } : prev,
      );
    },
    [activeFile?.fileId, note?.content],
  );

  const tabClasses = (tab: Exclude<RightPanelTab, "tasks">) => `
    px-2.5 py-1.5 text-xs font-medium transition-colors border-b-2
    ${
      activeTab === tab
        ? "border-primary-500 text-text-secondary"
        : "border-transparent text-text-tertiary hover:text-text-secondary"
    }
  `;

  return (
    <div className="h-full flex flex-col text-text">
      {presentation === "desktop" && (
        <div className="flex h-9 items-center justify-between border-b border-border-subtle px-3">
          <h3 className="truncate text-sm text-text-secondary">
            {activeTab === "tasks"
              ? t("Global Tasks")
              : activeFile?.title || t("No file")}
          </h3>
          {rightPanelOpen && (
            <button
              type="button"
              onClick={toggleRightPanel}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary"
              aria-label={t("Collapse panel")}
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-stretch justify-between border-b border-border-subtle px-2">
        <div className="flex" role="tablist" aria-label="Inspector tabs">
          <button
            type="button"
            role="tab"
            id="tab-meta"
            aria-selected={activeTab === "meta"}
            aria-controls="panel-meta"
            tabIndex={activeTab === "meta" ? 0 : -1}
            onClick={() => setRightPanelTab("meta")}
            className={tabClasses("meta")}
          >
            {t("Meta")}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-ai"
            aria-selected={activeTab === "ai"}
            aria-controls="panel-ai"
            tabIndex={activeTab === "ai" ? 0 : -1}
            onClick={() => setRightPanelTab("ai")}
            className={tabClasses("ai")}
          >
            {t("AI")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setRightPanelTab("tasks")}
          aria-pressed={activeTab === "tasks"}
          className={`border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "tasks"
              ? "border-primary-500 text-text-secondary"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {t("Global Tasks")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Meta Tab — file info + tags */}
        {activeTab === "meta" && (
          <div
            id="panel-meta"
            role="tabpanel"
            aria-labelledby="tab-meta"
            className="flex-1 overflow-y-auto p-4 space-y-5"
          >
            {loading ? (
              <p className="text-xs text-text-tertiary">{t("Loading...")}</p>
            ) : note ? (
              <>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("Title")}</dt>
                    <dd className="mt-0.5 text-text-secondary text-sm">
                      {note.title || activeFile?.title || t("Untitled")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("Type")}</dt>
                    <dd className="mt-0.5 text-text-secondary text-sm">
                      {activeFile.fileType}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("Created")}</dt>
                    <dd className="mt-0.5 text-text-tertiary text-sm">
                      {createdTimestamp ? (
                        <time
                          dateTime={createdTimestamp.iso}
                          title={createdTimestamp.iso}
                        >
                          {createdTimestamp.label}
                        </time>
                      ) : (
                        t("Unknown")
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("Updated")}</dt>
                    <dd className="mt-0.5 text-text-tertiary text-sm">
                      {updatedTimestamp ? (
                        <time
                          dateTime={updatedTimestamp.iso}
                          title={updatedTimestamp.iso}
                        >
                          {updatedTimestamp.label}
                        </time>
                      ) : (
                        t("Unknown")
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("ID")}</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-text-tertiary/50">
                      {note.id || activeFile.fileId}
                    </dd>
                  </div>
                </dl>

                {/* Tags section */}
                <div>
                  <p className="text-xs text-text-tertiary mb-2">{t("Tags")}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="group flex items-center gap-1 rounded-full border border-border-subtle bg-subtle pl-2 pr-1 py-0.5 text-xs text-text-tertiary"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => void removeTag(tag)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-error-400 rounded-full"
                          title={t("Remove tag")}
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 bg-background border border-border-subtle rounded-radius-md px-2 py-1 focus-within:border-primary-500/50 transition-colors">
                    <span className="text-text-tertiary text-xs">#</span>
                    <input
                      ref={tagInputRef}
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value.replace(/^#/, "").replace(/\s/g, "-"))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addTag();
                      }}
                      disabled={isSavingTag}
                      placeholder={t("add tag")}
                      className="flex-1 bg-transparent text-xs text-text placeholder:text-text-tertiary/60 focus:outline-none disabled:opacity-50 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => void addTag()}
                      disabled={!newTag.trim() || isSavingTag}
                      className="flex-shrink-0 text-text-tertiary hover:text-text-secondary disabled:opacity-30 transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-text-tertiary">
                {t("Select a note to view metadata.")}
              </p>
            )}
          </div>
        )}

        {/* AI Tab */}
        {activeTab === "ai" && (
          <div
            id="panel-ai"
            role="tabpanel"
            aria-labelledby="tab-ai"
            className="flex-1 flex flex-col min-h-0"
          >
            {activeFile?.fileId ? (
              <NoteSidebarChat
                key={activeFile.fileId}
                noteId={activeFile.fileId}
                noteTitle={activeFile.title}
              />
            ) : (
              <div className="p-4 flex flex-col items-center gap-2 text-center">
                <p className="text-xs text-text-tertiary">
                  {t("Select a note to start chatting with AI.")}
                </p>
                <a
                  href="/chat"
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {t("Open AI chat")}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <TodoTab surface={presentation === "drawer" ? "full" : "compact"} />
        )}
      </div>
    </div>
  );
}
