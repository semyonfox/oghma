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
import { useRouter } from "next/navigation";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import useNoteStore from "@/lib/notes/state/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { toast } from "sonner";
import { writeDraft, readDraft, clearDraft } from "@/lib/notes/draft-cache";
import { getEditorWidthStyle } from "@/lib/notes/editor-width";

// Milkdown accesses browser APIs on import, so load the writing surface client-side only.
const MilkdownWriteEditor = dynamic(() => import("./milkdown-write-editor"), {
  ssr: false,
});

interface MarkdownEditorProps {
  pane: "A" | "B";
  file: FileSpec;
}

const DRAFT_DEBOUNCE_MS = 1000;

/**
 * Markdown editor with one Notion-ish writing surface.
 * Markdown stays canonical underneath; the beta UI just softens the editing layer.
 */
const MarkdownEditor: FC<MarkdownEditorProps> = ({ pane: _pane, file }) => {
  const router = useRouter();
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
  const editorSize = useSettingsStore((s) => s.settings?.editorsize);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [resolvedEditorSize, setResolvedEditorSize] = useState<unknown>();
  const currentFileId = useRef(file.fileId);
  const { t } = useI18n();
  // stable identity for this editor instance (cross-pane sync)
  const editorId = useRef(Symbol("editor"));
  const isDirtyRef = useRef(false);
  // updatedAt from the last server response — used for conflict detection
  const serverUpdatedAt = useRef<string | undefined>(undefined);
  // debounce timer for draft writes
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const saveLatest = useRef<() => void>(() => {});
  const editorWidth = getEditorWidthStyle(resolvedEditorSize ?? editorSize);

  // keep refs in sync so event listeners always read current values
  const localContentRef = useRef(localContent);
  useEffect(() => {
    isDirtyRef.current = isDirty;
    localContentRef.current = localContent;
  }, [isDirty, localContent]);

  useEffect(() => {
    if (editorSize) setResolvedEditorSize(editorSize);
  }, [editorSize]);

  useEffect(() => {
    if (editorSize) return;

    let cancelled = false;
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (!cancelled && settings) {
          setSettings(settings);
          setResolvedEditorSize(settings.editorsize);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [editorSize, setSettings]);

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
    setLoaded(false);
    setIsDirty(false);
    isDirtyRef.current = false;
    editRevision.current = 0;
    saveQueued.current = false;
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
          toast.info(t("Restored unsaved draft"), { duration: 3000 });
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
        if (!cancelled && !result && currentFileId.current === stale) {
          router.replace("/notes");
          return;
        }
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
                t(
                  "This note was saved elsewhere. Your draft is older — save to overwrite, or discard.",
                ),
                { duration: 6000 },
              );
            }
          } else if (editRevision.current === 0) {
            // The request may have started from the instant IDB-cache view.
            // Never let that older response replace content after this editor
            // has accepted even one local edit (including an already-saved one).
            setLocalContent(result.content ?? "");
            localContentRef.current = result.content ?? "";
            setLoaded(true);
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (isDirtyRef.current) {
        writeDraft(currentFileId.current, localContentRef.current).catch(
          () => {},
        );
      }
    };
  }, [file.fileId, fetchNote, router, t]);

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
    if (!isDirtyRef.current || !file.fileId) return;
    if (saveInFlight.current) {
      saveQueued.current = true;
      return;
    }

    const contentToSave = localContentRef.current;
    const revisionToSave = editRevision.current;
    saveInFlight.current = true;
    saveQueued.current = false;
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }

    setIsSaving(true);
    setSaveError(false);
    try {
      await mutateNote(file.fileId, { content: contentToSave });
      const savedCurrentRevision =
        revisionToSave === editRevision.current &&
        contentToSave === localContentRef.current;
      if (savedCurrentRevision) {
        isDirtyRef.current = false;
        setIsDirty(false);
        markSynced(file.fileId);
        await clearDraft(file.fileId).catch(() => {});
      } else {
        isDirtyRef.current = true;
        setIsDirty(true);
        markModified(file.fileId);
      }
      // broadcast to other panes showing this file
      window.dispatchEvent(
        new CustomEvent("note-content-sync", {
          detail: {
            fileId: file.fileId,
            content: contentToSave,
            sourceId: editorId.current,
          },
        }),
      );
    } catch (error) {
      console.error("Save failed:", error);
      setSaveError(true);
      toast.error(t("Failed to save note"));
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
      if (saveQueued.current && isDirtyRef.current) {
        saveQueued.current = false;
        queueMicrotask(() => saveLatest.current());
      }
    }
  }, [file.fileId, mutateNote, markModified, markSynced, t]);

  saveLatest.current = () => {
    void handleSave();
  };

  // Ctrl+S handler. CodeMirror also handles it while focused; this catches
  // toolbar/outer-shell focus so the editor still behaves like one mode.
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
        <div className="flex h-7 items-center gap-2 text-xs text-text-tertiary">
          <span className="inline-flex h-6 items-center rounded-radius-sm bg-primary-500/12 px-2.5 font-medium text-primary-300">
            {t("Write")}
          </span>
          <span className="hidden sm:inline-flex h-6 items-center rounded-radius-sm border border-border-subtle px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
            {t("Beta")}
          </span>
        </div>

        {/* Save Status + Guide link */}
        <div className="flex h-7 items-center gap-2">
          <Link
            href="/syntax-guide"
            target="_blank"
            className="inline-flex h-6 items-center rounded-radius-sm px-2 text-xs text-text-tertiary hover:bg-subtle hover:text-text-secondary transition-colors"
          >
            {t("Syntax Guide")}
          </Link>
          {isDirty && !isSaving ? (
            <button
              onClick={handleSave}
              className="inline-flex h-6 items-center gap-1.5 rounded-radius-sm px-2 text-xs font-mono text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400 transition-colors"
              title={t("Save (Ctrl+S)")}
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
              {t("Unsaved")}
            </button>
          ) : (
            <span
              className={`inline-flex h-6 items-center rounded-radius-sm px-2 text-xs font-mono ${
                isSaving
                  ? "text-yellow-500"
                  : saveError
                    ? "text-error-400"
                    : "text-success-500"
              }`}
            >
              {isSaving
                ? t("Saving...")
                : saveError
                  ? t("Save failed")
                  : t("Saved")}
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className="flex-1 overflow-hidden bg-app-page"
        style={
          {
            "--editor-write-max-width": editorWidth.sourceMaxWidth,
          } as React.CSSProperties
        }
      >
        {loaded ? (
          <div className="h-full min-h-0 w-full">
            <MilkdownWriteEditor
              value={displayContent}
              onChange={(val, programmaticUpdate) => {
                setLocalContent(val);
                localContentRef.current = val;
                if (!programmaticUpdate) {
                  editRevision.current += 1;
                  isDirtyRef.current = true;
                  setIsDirty(true);
                  scheduleDraftWrite(val);
                }
              }}
              onSave={handleSave}
              placeholder={t("Start writing...")}
            />
          </div>
        ) : (
          <div
            className="h-full min-h-0 w-full overflow-hidden"
            aria-busy="true"
            aria-label={t("Loading...")}
          >
            <div
              className="mx-auto h-full w-full px-6 py-8 sm:px-10"
              style={{ maxWidth: editorWidth.sourceMaxWidth }}
            >
              <div className="h-5 w-2/5 animate-pulse rounded-radius-sm bg-subtle" />
              <div className="mt-7 space-y-3" aria-hidden="true">
                <div className="h-3 w-full animate-pulse rounded-radius-sm bg-subtle" />
                <div className="h-3 w-11/12 animate-pulse rounded-radius-sm bg-subtle" />
                <div className="h-3 w-4/5 animate-pulse rounded-radius-sm bg-subtle" />
              </div>
              <span className="sr-only">{t("Loading...")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MarkdownEditor);
