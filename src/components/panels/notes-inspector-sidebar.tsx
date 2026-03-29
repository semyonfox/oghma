"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore, {
  type RightPanelTab,
} from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { extractTags } from "@/lib/notes/utils/file-spec";
import ChatInterface from "@/components/chat/chat-interface";
import AssignmentTracker from "@/components/panels/assignment-tracker";

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

  const tabClasses = (tab: RightPanelTab) => `
    px-3 py-2 text-xs font-medium transition-colors border-b-2
    ${
      activeTab === tab
        ? "border-primary-500 text-text-secondary"
        : "border-transparent text-text-tertiary hover:text-text-secondary"
    }
  `;

  return (
    <div className="h-full flex flex-col bg-surface text-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <h3 className="text-sm font-medium text-text-secondary truncate">
          {activeFile?.title || t("No file")}
        </h3>
        {rightPanelOpen && (
          <button
            onClick={toggleRightPanel}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white/5 hover:text-text-secondary flex-shrink-0"
            title={t("Collapse panel")}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-border-subtle px-3 gap-0"
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
          aria-selected={activeTab === "tags"}
          aria-controls="panel-tags"
          onClick={() => setRightPanelTab("tags")}
          className={tabClasses("tags")}
        >
          {t("Tags")}
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
        {/* Metadata Tab */}
        {activeTab === "meta" && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-xs text-text-tertiary">{t("Loading...")}</p>
            ) : note ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-text-tertiary">
                    {t("Title")}
                  </dt>
                  <dd className="mt-1 text-text-secondary text-sm">
                    {note.title || activeFile?.title || t("Untitled")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-text-tertiary">
                    {t("Type")}
                  </dt>
                  <dd className="mt-1 text-text-secondary text-sm">
                    {activeFile.fileType}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-text-tertiary">
                    {t("Created")}
                  </dt>
                  <dd className="mt-1 text-text-tertiary text-sm">
                    {note.created_at
                      ? new Date(note.created_at).toLocaleDateString()
                      : t("Unknown")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-text-tertiary">
                    {t("Updated")}
                  </dt>
                  <dd className="mt-1 text-text-tertiary text-sm">
                    {note.updated_at
                      ? new Date(note.updated_at).toLocaleDateString()
                      : t("Unknown")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-widest text-text-tertiary">
                    {t("ID")}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-[10px] text-text-tertiary opacity-60">
                    {note.note_id || note.id || activeFile.fileId}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-text-tertiary">
                {t("Select a note to view metadata.")}
              </p>
            )}
          </div>
        )}

        {/* Tags Tab */}
        {activeTab === "tags" && (
          <div className="flex-1 overflow-y-auto p-4">
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border-subtle bg-white/5 px-2 py-0.5 text-xs text-text-tertiary"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                {t("No tags found in this note.")}
              </p>
            )}
          </div>
        )}

        {/* AI Tab */}
        {activeTab === "ai" && (
          <div className="flex-1 flex flex-col min-h-0">
            {activeFile?.fileId && (
              <div className="flex-shrink-0 flex items-center justify-between px-3 pt-3 pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
                  <p className="text-[11px] text-text-tertiary truncate">
                    {t("AI Chat")} — {activeFile.title || t("Untitled")}
                  </p>
                </div>
                <a
                  href={`/chat?noteId=${activeFile.fileId}&noteTitle=${encodeURIComponent(activeFile.title || "")}`}
                  className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
                  title={t("Open full chat")}
                >
                  {t("Full chat")}
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              </div>
            )}
            {activeFile?.fileId ? (
              <ChatInterface
                compact
                noteId={activeFile.fileId}
                noteTitle={activeFile.title}
                className="flex-1 min-h-0"
              />
            ) : (
              <div className="p-4 flex flex-col items-center gap-3 text-center">
                <SparklesIcon className="w-8 h-8 text-text-tertiary opacity-40" />
                <p className="text-xs text-text-tertiary">
                  {t("Select a note to start chatting with AI.")}
                </p>
                <a
                  href="/chat"
                  className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  {t("Open AI chat")} →
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
