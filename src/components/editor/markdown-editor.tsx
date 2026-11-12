"use client";

import { FC, useState, useEffect, useRef, useEffectEvent } from "react";
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

// the IndexedDB cache is loaded lazily and a miss falls through to the API
async function readCachedContent(noteId: string): Promise<{ content: string; updatedAt?: string } | null> {
  try {
    const { noteCacheInstance } = await import("@/lib/notes/cache");
    const cached = await noteCacheInstance.getItem<{ content?: string; updatedAt?: string }>(noteId);
    return typeof cached?.content === "string"
      ? { content: cached.content, updatedAt: cached.updatedAt }
      : null;
  } catch {
    return null;
  }
}

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
  const openLinkedNote = async (noteId: string) => {
    // split panes are desktop-only, matching SplitEditorPane's breakpoint
    const isDesktop = window.matchMedia?.("(min-width: 1024px)").matches === true;
    if (isDesktop && (await openLinkedFileBeside(noteId, pane))) return;
    router.push(`/notes/${noteId}`);
  };
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
  // the version of the body local edits started from
  const baseUpdatedAt = useRef<string | undefined>(undefined);
  // set after a 409: autosave pauses until the user saves on purpose
  const conflictRef = useRef(false);
  const [conflicted, setConflicted] = useState(false);
  const baseContent = useRef("");
  const savingContent = useRef<string | null>(null);
  const enterConflict = () => {
    conflictRef.current = true;
    setConflicted(true);
  };
  // debounce timer for draft writes
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const saveLatest = useRef<(keepMine?: boolean) => void>(() => {});
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
      writeDraft(currentFileId.current, localContentRef.current, draftOwner, baseUpdatedAt.current).catch(
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
    baseUpdatedAt.current = undefined;
    conflictRef.current = false;
    setConflicted(false);
    baseContent.current = "";

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
      const draft = await readDraft(file.fileId, draftOwner, () => {
        const state = useLayoutStore.getState();
        const otherPane = pane === "A" ? state.paneB : state.paneA;
        const otherOwner = otherPane?.draftOwner ?? (pane === "A" ? "B" : "A");
        return otherPane?.fileId !== file.fileId || otherOwner === draftOwner;
      }).catch(() => null); // draft read failure is non-fatal
      if (draft && !cancelled && currentFileId.current === stale) {
        setLocalContent(draft.content);
        localContentRef.current = draft.content;
        isDirtyRef.current = true;
        setLoaded(true);
        setIsDirty(true);
        baseUpdatedAt.current = draft.baseUpdatedAt;
        restoredDraft = draft;
        showingLocalCopy = true;
      }

      // try IDB cache for instant display (if no draft)
      if (!restoredDraft) {
        const cachedContent = await readCachedContent(file.fileId);
        if (
          !cancelled &&
          cachedContent != null &&
          currentFileId.current === stale
        ) {
          setLocalContent(cachedContent.content);
          localContentRef.current = cachedContent.content;
          baseContent.current = cachedContent.content;
          baseUpdatedAt.current = cachedContent.updatedAt;
          setLoaded(true);
          showingLocalCopy = true;
        }
      }

      // keep whatever local copy is on screen; with nothing to show, offer a retry
      const reportUnreachable = () => {
        if (cancelled || currentFileId.current !== stale) return;
        if (restoredDraft) notifyRecovery();
        if (!showingLocalCopy) setLoadFailed(true);
      };

      // fetch from API for freshness
      const fetched = await fetchNote(file.fileId).then(
        (note) => ({ note }),
        () => null,
      );
      if (!fetched) {
        console.error("note_load_failed");
        reportUnreachable();
        return;
      }
      const result = fetched.note;
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
        const content = result.content ?? "";
        if (!restoredDraft && editRevision.current === 0) {
          baseContent.current = content;
          baseUpdatedAt.current = result.updatedAt;
          conflictRef.current = false;
          setConflicted(false);
          setLocalContent(content);
          localContentRef.current = content;
          setLoaded(true);
        } else if (content === localContentRef.current) {
          baseContent.current = content;
          baseUpdatedAt.current = result.updatedAt;
          conflictRef.current = false;
          setConflicted(false);
          isDirtyRef.current = false;
          setIsDirty(false);
          markSynced(file.fileId);
          if (restoredDraft) await clearDraft(file.fileId, restoredDraft, draftOwner).catch(() => {});
        } else if (
          restoredDraft ? restoredDraft.baseUpdatedAt !== result.updatedAt : content !== baseContent.current
        ) {
          enterConflict();
        } else {
          baseContent.current = content;
          baseUpdatedAt.current = result.updatedAt;
          if (restoredDraft) notifyRecovery();
        }
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
        writeDraft(currentFileId.current, localContentRef.current, draftOwner, baseUpdatedAt.current).catch(
          () => {},
        );
      }
    };
  }, [dismissUnavailablePane, draftOwner, file.fileId, fetchNote, loadAttempt, markSynced, pane, router, t]);

  // removed: the old effect watched the global `note` singleton, meaning a
  // fetchNote in pane B would push new state into pane A and cause a flash.
  // now fetchNote's return value (in the effect above) is the sole content source.

  // mutateNote broadcasts synchronously, before its promise resolves
  useEffect(() => {
    const handler = (e: Event) => {
      const detail: unknown = (e as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object" || !("fileId" in detail) || detail.fileId !== file.fileId) return;
      const content = "content" in detail && typeof detail.content === "string" ? detail.content : undefined;
      const updatedAt = "updatedAt" in detail && typeof detail.updatedAt === "string" ? detail.updatedAt : undefined;
      if (content === savingContent.current || content === baseContent.current) {
        if (content !== undefined) baseContent.current = content;
        baseUpdatedAt.current = updatedAt;
      } else if (content !== undefined && (!isDirtyRef.current || content === localContentRef.current)) {
        baseContent.current = content;
        baseUpdatedAt.current = updatedAt;
        localContentRef.current = content;
        setLocalContent(content);
        conflictRef.current = false;
        setConflicted(false);
      } else if (content !== undefined && content !== localContentRef.current) {
        enterConflict();
      }
    };
    window.addEventListener("note-content-sync", handler);
    return () => window.removeEventListener("note-content-sync", handler);
  }, [file.fileId]);

  const displayContent = (loaded ? localContent : "");

  // track dirty state in sync status store
  useEffect(() => {
    if (isDirty && file.fileId) {
      markModified(file.fileId);
    }
  }, [isDirty, file.fileId, markModified]);

  // debounced draft write — keeps IDB in sync with unsaved content
  const scheduleDraftWrite = (content: string) => {
    if (!file.fileId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      writeDraft(file.fileId, content, draftOwner, baseUpdatedAt.current).catch(() => {});
    }, DRAFT_DEBOUNCE_MS);
  };

  const scheduleAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      if (!conflictRef.current) saveLatest.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const persistNote = async (contentToSave: string, revisionToSave: number) => {
    const savedDraft = await writeDraft(file.fileId, contentToSave, draftOwner, baseUpdatedAt.current).catch(() => undefined);
    const expectedUpdatedAt = baseUpdatedAt.current;
    savingContent.current = contentToSave;
    const outcome = await mutateNote(file.fileId, {
      content: contentToSave,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }).then(
      (saved) => ({ saved }),
      (error: unknown) => ({ error }),
    );

    savingContent.current = null;
    if ("error" in outcome) {
      const { error } = outcome;
      if (error instanceof NoteConflictError) {
        // the stamp belongs to the note that was open when the save started
        if (currentFileId.current !== file.fileId) return;
        // keep the local text dirty and recoverable; the next deliberate save
        // carries the fresh stamp and wins
        enterConflict();
        toast.warning(
          t(
            "This note was saved elsewhere. Save to keep yours, or load theirs.",
          ),
          { id: `draft-conflict:${file.fileId}`, duration: 6000 },
        );
        return;
      }
      console.error("note_save_failed");
      setSaveError(true);
      toast.error(t("Failed to save note"));
      return;
    }

    const { saved } = outcome;
    if (currentFileId.current !== file.fileId) return;
    // a broadcast from a later save may already have moved the base on
    if (saved?.updatedAt && (!baseUpdatedAt.current || Date.parse(saved.updatedAt) >= Date.parse(baseUpdatedAt.current))) {
      baseContent.current = contentToSave;
      baseUpdatedAt.current = saved.updatedAt;
    }
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
  };

  // only Save and Ctrl+S may lift a conflict
  const handleSave = async (keepMine = false) => {
    if (!isDirtyRef.current || !file.fileId) return;
    if (!baseUpdatedAt.current) enterConflict();
    if (conflictRef.current && !keepMine) return;
    if (saveInFlight.current) {
      saveQueued.current = true;
      return;
    }

    // claimed before the fetch so a second keep-mine press can't send its own PUT
    saveInFlight.current = true;
    if (conflictRef.current) {
      const theirs = await fetchNote(file.fileId).catch(() => undefined);
      if (!theirs || currentFileId.current !== file.fileId) {
        saveInFlight.current = false;
        return;
      }
      baseUpdatedAt.current = theirs.updatedAt;
      conflictRef.current = false;
      setConflicted(false);
    }
    const contentToSave = localContentRef.current;
    const revisionToSave = editRevision.current;
    saveQueued.current = false;
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
    await persistNote(contentToSave, revisionToSave).finally(() => {
      saveInFlight.current = false;
      setIsSaving(false);
      if (saveQueued.current && isDirtyRef.current && !conflictRef.current) {
        saveQueued.current = false;
        queueMicrotask(() => saveLatest.current());
      }
    });
  };

  useEffect(() => {
    saveLatest.current = (keepMine = false) => void handleSave(keepMine);
  });

  // Ctrl+S handler. CodeMirror also handles it while focused; this catches
  // toolbar/outer-shell focus so the editor still behaves like one mode.
  const saveFromShortcut = useEffectEvent(() => void handleSave(true));
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && useLayoutStore.getState().activePane === pane) {
        e.preventDefault();
        saveFromShortcut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pane]);

  // save on blur — when user clicks away from the editor
  const handleEditorBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest("[data-save-action]")) return;
    // only save if focus is leaving the editor entirely (not moving within it)
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) && isDirtyRef.current) {
      handleSave();
    }
  };

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

  useEffect(() => {
    setIndicator(saveIndicatorKey(file.fileId, draftOwner), {
      state: saveState,
      save: () => saveLatest.current(true),
      ready: loaded,
    });
  }, [draftOwner, file.fileId, loaded, saveState, setIndicator]);

  useEffect(() => {
    const fileId = saveIndicatorKey(file.fileId, draftOwner);
    return () => clearIndicator(fileId);
  }, [draftOwner, file.fileId, clearIndicator]);

  return (
    <div className="relative h-full flex flex-col bg-app-page" onBlur={handleEditorBlur}>
      {conflicted && (
        <div className="flex items-center gap-3 p-3 text-app-text">
          <span>{t("This note was saved elsewhere. Save to keep yours, or load theirs.")}</span>
          <button type="button" data-save-action onClick={async () => {
            const theirs = await fetchNote(file.fileId);
            if (!theirs) return;
            if (draftTimer.current) clearTimeout(draftTimer.current);
            if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
            await clearDraft(file.fileId, undefined, draftOwner);
            baseContent.current = theirs.content ?? "";
            baseUpdatedAt.current = theirs.updatedAt;
            localContentRef.current = baseContent.current;
            setLocalContent(baseContent.current);
            isDirtyRef.current = false;
            setIsDirty(false);
            conflictRef.current = false;
            setConflicted(false);
            markSynced(file.fileId);
          }}>{t("Load theirs")}</button>
        </div>
      )}
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
              onSave={() => void handleSave(true)}
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
              className="rounded-radius-md px-3 py-2 text-sm font-medium text-accent hover:bg-subtle hover:text-accent-hover"
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

export default MarkdownEditor;
