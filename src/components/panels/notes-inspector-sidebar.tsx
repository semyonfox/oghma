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

const ChatInterface = dynamic(
  () => import("@/components/chat/chat-interface"),
  { ssr: false }
);
const AssignmentTracker = dynamic(
  () => import("@/components/panels/assignment-tracker"),
  { ssr: false }
);

interface InspectorNote {
  id: string;
  title?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  note_id?: string;
}

export default function NotesInspectorSidebar() {
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

  const tabClasses = (tab: RightPanelTab) => `
    px-2.5 py-1.5 text-xs font-medium transition-colors border-b-2
    ${
      activeTab === tab
        ? "border-primary-500 text-text-secondary"
        : "border-transparent text-text-tertiary hover:text-text-secondary"
    }
  `;

  return (
    <div className="h-full flex flex-col text-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 h-9">
        <h3 className="text-sm text-text-secondary truncate">
          {activeFile?.title || t("No file")}
        </h3>
        {rightPanelOpen && (
          <button
            onClick={toggleRightPanel}
            className="rounded p-1 text-text-tertiary transition-colors hover:bg-white/[0.06] hover:text-text-secondary flex-shrink-0"
            title={t("Collapse panel")}
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-border-subtle px-2"
        role="tablist"
        aria-label="Inspector tabs"
      >
        <button
          role="tab"
          aria-selected={activeTab === "meta"}
          aria-controls="panel-meta"
          onClick={() => setRightPanelTab("meta")}
          className={tabClasses("meta")}
        >
          {t("Meta")}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "ai"}
          aria-controls="panel-ai"
          onClick={() => setRightPanelTab("ai")}
          className={tabClasses("ai")}
        >
          {t("AI")}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "tasks"}
          aria-controls="panel-tasks"
          onClick={() => setRightPanelTab("tasks")}
          className={tabClasses("tasks")}
        >
          {t("Tasks")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Meta Tab — file info + tags */}
        {activeTab === "meta" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
                      {note.created_at
                        ? new Date(note.created_at).toLocaleDateString()
                        : t("Unknown")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("Updated")}</dt>
                    <dd className="mt-0.5 text-text-tertiary text-sm">
                      {note.updated_at
                        ? new Date(note.updated_at).toLocaleDateString()
                        : t("Unknown")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-tertiary">{t("ID")}</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-text-tertiary/50">
                      {note.note_id || note.id || activeFile.fileId}
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
                  <div className="flex items-center gap-1.5 bg-background border border-border-subtle rounded-md px-2 py-1 focus-within:border-primary-500/50 transition-colors">
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
                      className="flex-1 bg-transparent text-xs text-text placeholder-text-tertiary/60 focus:outline-none disabled:opacity-50 min-w-0"
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
          <div className="flex-1 flex flex-col min-h-0">
            {activeFile?.fileId && (
              <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-subtle">
                <p className="text-xs text-text-tertiary truncate">
                  {activeFile.title || t("Untitled")}
                </p>
                <a
                  href={`/chat?noteId=${activeFile.fileId}&noteTitle=${encodeURIComponent(activeFile.title || "")}`}
                  className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                  title={t("Open full chat")}
                >
                  {t("Full chat")}
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              </div>
            )}
            {activeFile?.fileId ? (
              <ChatInterface
                key={activeFile.fileId}
                compact
                noteId={activeFile.fileId}
                noteTitle={activeFile.title}
                className="flex-1 min-h-0"
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
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AssignmentTracker />
          </div>
        )}
      </div>
    </div>
  );
}
