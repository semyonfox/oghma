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
import useLayoutStore, {
  FileSpec,
} from "@/lib/notes/state/layout";
import useNoteStore from "@/lib/notes/state/note";
import { NoteConflictError } from "@/lib/notes/api/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import useSaveIndicatorStore, {
  SaveState,
  saveIndicatorKey,
} from "@/lib/notes/state/save-indicator";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { toast } from "sonner";
import { writeDraft, readDraft, clearDraft, acknowledgeDraftRecovery, type NoteDraft } from "@/lib/notes/draft-cache";
import { getEditorMaxWidth } from "@/lib/notes/editor-width";
import { openLinkedFileBeside } from "@/lib/notes/utils/open-linked-file";

// Milkdown accesses browser APIs on import, so load the writing surface client-side only.
const MilkdownWriteEditor = dynamic(() => import("./milkdown-write-editor"), {
  ssr: false,
});

interface MarkdownEditorProps {
  pane: "A" | "B";
  file: FileSpec;
}

const DRAFT_DEBOUNCE_MS = 1000;
// idle time after the last keystroke before the note is pushed to the server;
// drafts already cover the gap locally, this closes it across devices
const AUTOSAVE_DEBOUNCE_MS = 3000;

// the note store reports every failed fetch as a missing note. only a definite
// answer from the server may close the pane: offline or a 5xx keeps it open
async function noteIsGone(noteId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/notes/${encodeURIComponent(noteId)}?fields=id`,
      { cache: "no-store" },
    );
    return response.status === 400 || response.status === 403 || response.status === 404;
  } catch {
    return false;
  }
}

/**
 * Markdown editor with one Notion-ish writing surface.
 * Markdown stays canonical underneath; the beta UI just softens the editing layer.
 */
const MarkdownEditor: FC<MarkdownEditorProps> = ({ pane, file }) => {
  const router = useRouter();
  const openLinkedNote = useCallback(
    async (noteId: string) => {
      // split panes are desktop-only, matching SplitEditorPane's breakpoint
      const isDesktop = window.matchMedia?.("(min-width: 1024px)").matches === true;
      if (isDesktop && (await openLinkedFileBeside(noteId, pane))) return;
      router.push(`/notes/${noteId}`);
    },
    [pane, router],
  );
  const draftOwner = file.draftOwner ?? pane;
  const [localContent, setLocalContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // only subscribe to stable action refs — never the global `note` object.
  // subscribing to `note` caused pane A to flicker/reload whenever pane B
  // fetched a different note because both shared the same singleton state.
  const fetchNote = useNoteStore((s) => s.fetchNote);
  const mutateNote = useNoteStore((s) => s.mutateNote);
  const dismissUnavailablePane = useLayoutStore(
    (s) => s.dismissUnavailablePane,
  );
  const markModified = useSyncStatusStore((s) => s.markModified);
  const markSynced = useSyncStatusStore((s) => s.markSynced);
  const editorSize = useSettingsStore((s) => s.settings?.editorsize);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const currentFileId = useRef(file.fileId);
  const { t } = useI18n();
  const isDirtyRef = useRef(false);
  // updatedAt from the last server response — sent with every save so the
  // server can refuse to overwrite a version this editor never saw
  const serverUpdatedAt = useRef<string | undefined>(undefined);
  // set after a 409: autosave pauses until the user saves on purpose
  const conflictRef = useRef(false);
  // debounce timer for draft writes
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const saveLatest = useRef<() => void>(() => {});
  const editorMaxWidth = getEditorMaxWidth(editorSize);

  // keep refs in sync so event listeners always read current values
  const localContentRef = useRef(localContent);
  useEffect(() => {
    isDirtyRef.current = isDirty;
    localContentRef.current = localContent;
  }, [isDirty, localContent]);

  useEffect(() => {
    if (editorSize) return;

    let cancelled = false;
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (!cancelled && settings) setSettings(settings);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [editorSize, setSettings]);

  // flush the debounced draft whenever the page may be going away. mobile
  // browsers and the Android WebView often kill a hidden page without ever
  // firing beforeunload, so hiding the page counts too
  useEffect(() => {
    const flushDraft = () => {
      if (!isDirtyRef.current) return false;
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      writeDraft(currentFileId.current, localContentRef.current, draftOwner).catch(
        () => {},
      );
      return true;
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (flushDraft()) e.preventDefault();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [draftOwner]);

  // load note content when file changes.
  // priority: draft (if newer) > API > IDB cache
  useEffect(() => {
    if (!file.fileId) return;
    currentFileId.current = file.fileId;
    setLoaded(false);
    setLoadFailed(false);
    setIsDirty(false);
    isDirtyRef.current = false;
    editRevision.current = 0;
    saveQueued.current = false;
    serverUpdatedAt.current = undefined;
    conflictRef.current = false;

    let cancelled = false;
    const stale = currentFileId.current;

    (async () => {
      // check for an unsaved draft first — restore immediately if it exists
      let restoredDraft: NoteDraft | null = null;
      let showingLocalCopy = false;
      const notifyRecovery = () => {
        if (!cancelled && acknowledgeDraftRecovery(file.fileId)) {
          toast.info(t("Restored unsaved draft"), {
            id: `draft-recovery:${file.fileId}`, duration: 3000,
          });
        }
      };
      try {
        const draft = await readDraft(file.fileId, draftOwner, () => {
          const state = useLayoutStore.getState();
          const otherPane = pane === "A" ? state.paneB : state.paneA;
          const otherOwner = otherPane?.draftOwner ?? (pane === "A" ? "B" : "A");
          return otherPane?.fileId !== file.fileId || otherOwner === draftOwner;
        });
        if (draft && !cancelled && currentFileId.current === stale) {
          setLocalContent(draft.content);
          localContentRef.current = draft.content;
          isDirtyRef.current = true;
          setLoaded(true);
          setIsDirty(true);
          restoredDraft = draft;
          showingLocalCopy = true;
        }
      } catch {
        // draft read failure is non-fatal
      }

      // try IDB cache for instant display (if no draft)
      if (!restoredDraft) {
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
            localContentRef.current = cached.content;
            setLoaded(true);
            showingLocalCopy = true;
          }
        } catch {
          // cache miss — fall through to API fetch
        }
      }

      // keep whatever local copy is on screen; with nothing to show, offer a retry
      const reportUnreachable = () => {
        if (cancelled || currentFileId.current !== stale) return;
        if (restoredDraft) notifyRecovery();
        if (!showingLocalCopy) setLoadFailed(true);
      };

      // fetch from API for freshness
      try {
        const result = await fetchNote(file.fileId);
        if (!cancelled && !result && currentFileId.current === stale) {
          if (!(await noteIsGone(file.fileId))) {
            reportUnreachable();
            return;
          }
          if (cancelled || currentFileId.current !== stale) return;
          const survivingFile = dismissUnavailablePane(pane, file.fileId);
          if (pane === "A" && survivingFile !== undefined) {
            router.replace(
              survivingFile?.fileId ? `/notes/${survivingFile.fileId}` : "/notes",
            );
          }
          return;
        }
        if (!cancelled && result && currentFileId.current === stale) {
          serverUpdatedAt.current = result.updatedAt;

          // If a draft was restored, do not overwrite the user's unsaved work.
          // Check whether the server version is newer.
          if (restoredDraft) {
            const draft = restoredDraft;
            if (cancelled || currentFileId.current !== stale) return;
            const matchesServer = draft.content === (result.content ?? "");
            if (matchesServer && editRevision.current === 0) {
              isDirtyRef.current = false;
              setIsDirty(false);
              markSynced(file.fileId);
              await clearDraft(file.fileId, draft, draftOwner).catch(() => {});
            }
            const serverMs = result.updatedAt
              ? new Date(result.updatedAt).getTime()
              : 0;
            const draftMs = draft.draftAt;
            if (!matchesServer && serverMs > draftMs) {
              // The server has a newer version than the draft. Warn once, but do not block.
              toast.warning(
                t(
                  "This note was saved elsewhere. Your draft is older — save to overwrite, or discard.",
                ),
                { id: `draft-conflict:${file.fileId}`, duration: 6000 },
              );
            } else if (!matchesServer) {
              notifyRecovery();
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
      } catch (_err) {
        console.error("note_load_failed");
        reportUnreachable();
      }
    })();

    return () => {
      cancelled = true;
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (isDirtyRef.current) {
        writeDraft(currentFileId.current, localContentRef.current, draftOwner).catch(
          () => {},
        );
      }
    };
  }, [dismissUnavailablePane, draftOwner, file.fileId, fetchNote, loadAttempt, markSynced, pane, router, t]);

  // removed: the old effect watched the global `note` singleton, meaning a
  // fetchNote in pane B would push new state into pane A and cause a flash.
  // now fetchNote's return value (in the effect above) is the sole content source.

  // the note store announces every successful save of this file (content
  // saves from another pane, renames from the sidebar). Always adopt the new
  // stamp; adopt the body only when there is nothing unsaved here.
  useEffect(() => {
    const handler = (e: Event) => {
      const { fileId, content, updatedAt } = (e as CustomEvent).detail;
      if (fileId !== file.fileId) return;
      if (typeof updatedAt === "string") serverUpdatedAt.current = updatedAt;
      if (typeof content === "string" && !isDirtyRef.current) {
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
        writeDraft(file.fileId, content, draftOwner).catch(() => {});
      }, DRAFT_DEBOUNCE_MS);
    },
    [draftOwner, file.fileId],
  );

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      if (!conflictRef.current) saveLatest.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  // save via API. Every caller except the autosave timer is a deliberate user
  // action, which is what lifts a conflict and overwrites the other version.
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
    conflictRef.current = false;
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    setIsSaving(true);
    setSaveError(false);
    try {
      const savedDraft = await writeDraft(file.fileId, contentToSave, draftOwner).catch(() => undefined);
      const saved = await mutateNote(file.fileId, {
        content: contentToSave,
        ...(serverUpdatedAt.current
          ? { expectedUpdatedAt: serverUpdatedAt.current }
          : {}),
      });
      if (currentFileId.current !== file.fileId) return;
      if (saved?.updatedAt) serverUpdatedAt.current = saved.updatedAt;
      const savedCurrentRevision =
        revisionToSave === editRevision.current &&
        contentToSave === localContentRef.current;
      if (savedCurrentRevision) {
        isDirtyRef.current = false;
        setIsDirty(false);
        markSynced(file.fileId);
        if (savedDraft) await clearDraft(file.fileId, savedDraft, draftOwner).catch(() => {});
      } else {
        isDirtyRef.current = true;
        setIsDirty(true);
        markModified(file.fileId);
      }
    } catch (error) {
      if (error instanceof NoteConflictError) {
        // the stamp belongs to the note that was open when the save started
        if (currentFileId.current !== file.fileId) return;
        // keep the local text dirty and recoverable; the next deliberate save
        // carries the fresh stamp and wins
        if (error.updatedAt) serverUpdatedAt.current = error.updatedAt;
        conflictRef.current = true;
        toast.warning(
          t(
            "This note was saved elsewhere. Your draft is older — save to overwrite, or discard.",
          ),
          { id: `draft-conflict:${file.fileId}`, duration: 6000 },
        );
        return;
      }
      console.error("note_save_failed");
      setSaveError(true);
      toast.error(t("Failed to save note"));
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
      if (saveQueued.current && isDirtyRef.current && !conflictRef.current) {
        saveQueued.current = false;
        queueMicrotask(() => saveLatest.current());
      }
    }
  }, [draftOwner, file.fileId, mutateNote, markModified, markSynced, t]);

  saveLatest.current = () => {
    void handleSave();
  };

  // Ctrl+S handler. CodeMirror also handles it while focused; this catches
  // toolbar/outer-shell focus so the editor still behaves like one mode.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && useLayoutStore.getState().activePane === pane) {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, pane]);

  // save on blur — when user clicks away from the editor
  const handleEditorBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest("[data-save-action]")) return;
      // only save if focus is leaving the editor entirely (not moving within it)
      if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) && isDirtyRef.current) {
        handleSave();
      }
    },
    [handleSave],
  );

  // publish save state to the pane header — the filename bar owns the button
  const setIndicator = useSaveIndicatorStore((s) => s.setIndicator);
  const clearIndicator = useSaveIndicatorStore((s) => s.clearIndicator);
  const saveState: SaveState = isSaving
    ? "saving"
    : saveError
      ? "error"
      : isDirty
        ? "dirty"
        : "saved";

  const requestSave = useCallback(() => {
    saveLatest.current();
  }, []);

  useEffect(() => {
    setIndicator(saveIndicatorKey(file.fileId, draftOwner), { state: saveState, save: requestSave, ready: loaded });
  }, [draftOwner, file.fileId, loaded, saveState, requestSave, setIndicator]);

  useEffect(() => {
    const fileId = saveIndicatorKey(file.fileId, draftOwner);
    return () => clearIndicator(fileId);
  }, [draftOwner, file.fileId, clearIndicator]);

  return (
    <div className="relative h-full flex flex-col bg-app-page" onBlur={handleEditorBlur}>
      {/* Content Area */}
      <div
        className="flex-1 overflow-hidden bg-app-page"
        style={
          {
            "--editor-write-max-width": editorMaxWidth,
          } as React.CSSProperties
        }
      >
        {loaded ? (
          <div className="h-full min-h-0 w-full">
            <MilkdownWriteEditor
              value={displayContent}
              onChange={(val, programmaticUpdate) => {
                if (val === localContentRef.current) return;
                setLocalContent(val);
                localContentRef.current = val;
                if (!programmaticUpdate) {
                  editRevision.current += 1;
                  isDirtyRef.current = true;
                  setIsDirty(true);
                  scheduleDraftWrite(val);
                  scheduleAutosave();
                }
              }}
              onSave={handleSave}
              placeholder={t("Start writing...")}
              currentNoteId={file.fileId}
              onOpenNote={openLinkedNote}
            />
          </div>
        ) : loadFailed ? (
          <div
            className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 px-6 text-center"
            role="alert"
          >
            <p className="text-sm text-text-secondary">
              {t("This note could not be loaded. Check your connection and try again.")}
            </p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="rounded-radius-md px-3 py-2 text-sm font-medium text-primary-400 hover:bg-subtle hover:text-primary-300"
            >
              {t("Try again")}
            </button>
          </div>
        ) : (
          <div
            className="h-full min-h-0 w-full overflow-hidden"
            aria-busy="true"
            aria-label={t("Loading...")}
          >
            <div
              className="mx-auto h-full w-full px-6 py-8 sm:px-10"
              style={{ maxWidth: editorMaxWidth }}
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
