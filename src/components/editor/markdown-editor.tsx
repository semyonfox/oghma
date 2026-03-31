"use client";

import {
  FC,
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import useNoteStore from "@/lib/notes/state/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import PreviewRenderer from "./preview-renderer";
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { toast } from "sonner";

// CodeMirror accesses browser APIs on import, so lazy-load it client-side only
const CodeMirrorEditor = dynamic(() => import("./codemirror-editor"), {
  ssr: false,
});

type EditorMode = "source" | "read";

interface MarkdownEditorProps {
  pane: "A" | "B";
  file: FileSpec;
}

/**
 * Markdown editor with Source (raw md) and Read (rendered preview) modes
 */
const MarkdownEditor: FC<MarkdownEditorProps> = ({ pane: _pane, file }) => {
  const [mode, setMode] = useState<EditorMode>("source");
  const [localContent, setLocalContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // only subscribe to stable action refs — never the global `note` object.
  // subscribing to `note` caused pane A to flicker/reload whenever pane B
  // fetched a different note because both shared the same singleton state.
  const fetchNote = useNoteStore((s) => s.fetchNote);
  const mutateNote = useNoteStore((s) => s.mutateNote);
  const { markModified, markSynced } = useSyncStatusStore();
  const currentFileId = useRef(file.fileId);
  const { t } = useI18n();
  // stable identity for this editor instance (cross-pane sync)
  const editorId = useRef(Symbol("editor"));
  const isDirtyRef = useRef(false);

  // keep isDirtyRef in sync so the event listener always reads current value
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // load note content when file changes.
  // reads IndexedDB cache first so the editor shows content instantly,
  // then refreshes from the API in the background (no flash).
  useEffect(() => {
    if (!file.fileId) return;
    currentFileId.current = file.fileId;
    setIsDirty(false);

    let cancelled = false;
    const stale = currentFileId.current;

    (async () => {
      // try IndexedDB cache first — avoids the "Loading..." flash
      try {
        const { noteCacheInstance } = await import("@/lib/notes/cache");
        const cached = await noteCacheInstance.getItem<{ content?: string }>(
          file.fileId,
        );
        if (
          !cancelled &&
          cached?.content != null &&
          currentFileId.current === stale
        ) {
          setLocalContent(cached.content);
          setLoaded(true);
        }
      } catch {
        // cache miss — fall through to API fetch
      }

      // always fetch from API for freshness
      try {
        const result = await fetchNote(file.fileId);
        if (!cancelled && result && currentFileId.current === stale) {
          setLocalContent(result.content ?? "");
          setLoaded(true);
        }
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.fileId, fetchNote]);

  // removed: the old effect watched the global `note` singleton, meaning a
  // fetchNote in pane B would push new state into pane A and cause a flash.
  // now fetchNote's return value (in the effect above) is the sole content source.

  // cross-pane sync: when another editor saves this file, pick up the new content
  useEffect(() => {
    const handler = (e: Event) => {
      const { fileId, content, sourceId } = (e as CustomEvent).detail;
      if (
        fileId === file.fileId &&
        sourceId !== editorId.current &&
        !isDirtyRef.current
      ) {
        setLocalContent(content);
      }
    };
    window.addEventListener("note-content-sync", handler);
    return () => window.removeEventListener("note-content-sync", handler);
  }, [file.fileId]);

  const displayContent = useMemo(
    () => (loaded ? localContent : ""),
    [localContent, loaded],
  );

  // track dirty state in sync status store
  useEffect(() => {
    if (isDirty && file.fileId) {
      markModified(file.fileId);
    }
  }, [isDirty, file.fileId, markModified]);

  // save via API
  const handleSave = useCallback(async () => {
    if (!isDirty || !file.fileId) return;

    setIsSaving(true);
    setSaveError(false);
    try {
      await mutateNote(file.fileId, { content: localContent });
      setIsDirty(false);
      markSynced(file.fileId);
      // broadcast to other panes showing this file
      window.dispatchEvent(
        new CustomEvent("note-content-sync", {
          detail: {
            fileId: file.fileId,
            content: localContent,
            sourceId: editorId.current,
          },
        }),
      );
    } catch (error) {
      console.error("Save failed:", error);
      setSaveError(true);
      toast.error("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [localContent, file.fileId, isDirty, mutateNote, markSynced]);

  // Ctrl+S handler (for read mode — CodeMirror handles it in source mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // save on blur — when user clicks away from the editor
  const handleEditorBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // only save if focus is leaving the editor entirely (not moving within it)
      if (!e.currentTarget.contains(e.relatedTarget as Node) && isDirty) {
        handleSave();
      }
    },
    [isDirty, handleSave],
  );

  return (
    <div
      className="h-full flex flex-col bg-background"
      onBlur={handleEditorBlur}
    >
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-background">
        {/* Source / Read toggle */}
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded">
          <button
            onClick={() => setMode("source")}
            className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
              mode === "source"
                ? "bg-primary-500 text-text"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Source
          </button>
          <button
            onClick={() => setMode("read")}
            className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
              mode === "read"
                ? "bg-primary-500 text-text"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Read
          </button>
        </div>

        {/* Save Status + Guide link */}
        <div className="flex items-center gap-3">
          <Link
            href="/syntax-guide"
            target="_blank"
            className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Syntax Guide
          </Link>
          {isDirty && !isSaving ? (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-[11px] font-mono text-yellow-500 hover:text-yellow-400 transition-colors"
              title="Save (Ctrl+S)"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 3h8l4 4v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                <path d="M7 3v4h6V3M7 13h6" />
              </svg>
              Unsaved
            </button>
          ) : (
            <span
              className={`text-[11px] font-mono ${
                isSaving
                  ? "text-yellow-500"
                  : saveError
                    ? "text-error-400"
                    : "text-success-500"
              }`}
            >
              {isSaving ? "Saving..." : saveError ? "Save failed" : "Saved"}
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto flex flex-col items-center bg-editor">
        {mode === "source" ? (
          loaded ? (
            <div className="w-full h-full">
              <CodeMirrorEditor
                value={displayContent}
                onChange={(val) => {
                  setLocalContent(val);
                  setIsDirty(true);
                }}
                onSave={handleSave}
                placeholder={t("Start writing...")}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
              Loading...
            </div>
          )
        ) : loaded ? (
          <div className="w-full max-w-[95ch] mx-auto h-full">
            <div className="px-12 pt-12 pb-48 prose prose-invert prose-headings:font-medium text-text-secondary">
              <PreviewRenderer content={displayContent} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MarkdownEditor);
