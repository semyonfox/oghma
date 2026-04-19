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
const PreviewRenderer = dynamic(() => import("./preview-renderer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
      Loading preview...
    </div>
  ),
});
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { toast } from "sonner";
import { writeDraft, readDraft, clearDraft } from "@/lib/notes/draft-cache";

// CodeMirror accesses browser APIs on import, so lazy-load it client-side only
const SourceEditor = dynamic(() => import("./source-editor"), {
  ssr: false,
});

type EditorMode = "source" | "read";

interface MarkdownEditorProps {
  pane: "A" | "B";
  file: FileSpec;
}

const DRAFT_DEBOUNCE_MS = 1000;

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
  // updatedAt from the last server response — used for conflict detection
  const serverUpdatedAt = useRef<string | undefined>(undefined);
  // debounce timer for draft writes
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep refs in sync so event listeners always read current values
  const localContentRef = useRef(localContent);
  useEffect(() => {
    isDirtyRef.current = isDirty;
    localContentRef.current = localContent;
  }, [isDirty, localContent]);

  // flush draft and warn on page close to prevent data loss
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      // fire-and-forget flush — IDB write is fast enough to land before teardown
      writeDraft(currentFileId.current, localContentRef.current).catch(
        () => {},
      );
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // load note content when file changes.
  // priority: draft (if newer) > API > IDB cache
  useEffect(() => {
    if (!file.fileId) return;
    currentFileId.current = file.fileId;
    setIsDirty(false);
    serverUpdatedAt.current = undefined;

    let cancelled = false;
    const stale = currentFileId.current;

    (async () => {
      // check for an unsaved draft first — restore immediately if it exists
      let draftRestored = false;
      try {
        const draft = await readDraft(file.fileId);
        if (draft && !cancelled && currentFileId.current === stale) {
          setLocalContent(draft.content);
          setLoaded(true);
          setIsDirty(true);
          draftRestored = true;
          toast.info("Restored unsaved draft", { duration: 3000 });
        }
      } catch {
        // draft read failure is non-fatal
      }

      // try IDB cache for instant display (if no draft)
      if (!draftRestored) {
        try {
          const { noteCacheInstance } = await import("@/lib/notes/cache");
          const cached = await noteCacheInstance.getItem<{
            content?: string;
            updatedAt?: string;
          }>(file.fileId);
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
      }

      // fetch from API for freshness
      try {
        const result = await fetchNote(file.fileId);
        if (!cancelled && result && currentFileId.current === stale) {
          serverUpdatedAt.current = result.updatedAt;

          // if a draft was restored, don't overwrite the user's unsaved work —
          // but check if the server version is actually newer (conflict)
          if (draftRestored) {
            const draft = await readDraft(file.fileId);
            const serverMs = result.updatedAt
              ? new Date(result.updatedAt).getTime()
              : 0;
            const draftMs = draft?.draftAt ?? 0;
            if (serverMs > draftMs) {
              // server has a newer version than the draft — warn once, don't block
              toast.warning(
                "This note was saved elsewhere. Your draft is older — save to overwrite, or discard.",
                { duration: 6000 },
              );
            }
          } else {
            setLocalContent(result.content ?? "");
            setLoaded(true);
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      if (draftTimer.current) clearTimeout(draftTimer.current);
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

  // debounced draft write — keeps IDB in sync with unsaved content
  const scheduleDraftWrite = useCallback(
    (content: string) => {
      if (!file.fileId) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        writeDraft(file.fileId, content).catch(() => {});
      }, DRAFT_DEBOUNCE_MS);
    },
    [file.fileId],
  );

  // save via API
  const handleSave = useCallback(async () => {
    if (!isDirty || !file.fileId) return;

    setIsSaving(true);
    setSaveError(false);
    try {
      await mutateNote(file.fileId, { content: localContent });
      setIsDirty(false);
      markSynced(file.fileId);
      // draft successfully pushed to cloud — safe to clear
      clearDraft(file.fileId).catch(() => {});
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
    <div className="h-full flex flex-col bg-app-page" onBlur={handleEditorBlur}>
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-app-page">
        {/* Source / Read toggle */}
        <div className="flex items-center gap-1 glass-panel p-0.5 rounded-radius-md">
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
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Syntax Guide
          </Link>
          {isDirty && !isSaving ? (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-xs font-mono text-yellow-500 hover:text-yellow-400 transition-colors"
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
              className={`text-xs font-mono ${
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
      <div className="flex-1 overflow-hidden bg-app-page">
        {mode === "source" ? (
          loaded ? (
            <div className="h-full min-h-0 w-full">
              <SourceEditor
                value={displayContent}
                onChange={(val) => {
                  setLocalContent(val);
                  setIsDirty(true);
                  scheduleDraftWrite(val);
                }}
                onSave={handleSave}
                placeholder={t("Start writing...")}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
              Loading...
            </div>
          )
        ) : loaded ? (
          <div className="h-full min-h-0 w-full overflow-auto px-4 py-10 md:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-3xl">
              <PreviewRenderer content={displayContent} noteId={file.fileId} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MarkdownEditor);
