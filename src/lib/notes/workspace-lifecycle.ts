"use client";

import { clearDeduplicationCache } from "@/lib/notes/api/request-deduplicator";
import { noteCacheInstance, uiCache } from "@/lib/notes/cache";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useNoteStore from "@/lib/notes/state/note";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useSaveIndicatorStore from "@/lib/notes/state/save-indicator";
import useSearchStore from "@/lib/notes/state/search";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import useTrashStore from "@/lib/notes/state/trash";
import {
  beginDraftCacheReset,
  clearAllDrafts,
  finishDraftCacheReset,
} from "@/lib/notes/draft-cache";

let resetInFlight: Promise<void> | null = null;
let cacheClearQueue = Promise.resolve();
const OWNER_STORAGE_KEY = "oghmaNotes-workspace-owner";

interface PersistedOwner {
  known: boolean;
  userId: string | null;
}

function readPersistedOwner(): PersistedOwner {
  if (typeof window === "undefined") return { known: false, userId: null };
  try {
    const value = window.localStorage.getItem(OWNER_STORAGE_KEY);
    if (value === null) return { known: false, userId: null };
    const parsed: unknown = JSON.parse(value);
    return {
      known: true,
      userId: typeof parsed === "string" ? parsed : null,
    };
  } catch {
    return { known: true, userId: null };
  }
}

function persistOwner(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(userId));
  } catch {
    // The in-memory generation guard still protects the active page.
  }
}

function adoptWorkspaceSession(userId: string | null): void {
  const noteGeneration = useNoteStore.getState().resetForSession(userId);
  useNoteTreeStore.getState().resetForSession(userId);
  useNoteStore.getState().markSessionReady(noteGeneration);
  persistOwner(userId);
}

export async function resetWorkspaceClientState(
  userId: string | null,
): Promise<void> {
  const draftGeneration = beginDraftCacheReset();
  try {
    window.localStorage.removeItem("canvas_active_job");
  } catch {
    // Canvas also fences its in-memory owner with the workspace generation.
  }
  const noteGeneration = useNoteStore.getState().resetForSession(userId);
  useNoteTreeStore.getState().resetForSession(userId);
  useLayoutStore.getState().resetWorkspace();
  useSyncStatusStore.setState({ status: {} });
  useSaveIndicatorStore.setState({ files: {} });
  useSearchStore.setState({ keyword: "", list: undefined });
  useTrashStore.setState({ keyword: undefined, list: undefined });
  clearDeduplicationCache();

  const clearing = cacheClearQueue
    .catch(() => {})
    .then(() =>
      Promise.all([
        noteCacheInstance.clear(),
        clearAllDrafts(),
        uiCache.removeItem("tree"),
      ]),
    )
    .then(() => {
      finishDraftCacheReset(draftGeneration);
      useNoteStore.getState().markSessionReady(noteGeneration);
      const state = useNoteStore.getState();
      if (state.generation === noteGeneration && state.ownerUserId === userId) {
        persistOwner(userId);
      }
    });
  cacheClearQueue = clearing.then(() => undefined, () => undefined);
  resetInFlight = clearing;
  try {
    await clearing;
  } finally {
    if (resetInFlight === clearing) resetInFlight = null;
  }
}

export async function reconcileWorkspaceSession(
  userId: string | null,
): Promise<boolean> {
  const treeState = useNoteTreeStore.getState();
  const noteState = useNoteStore.getState();
  if (
    treeState.ownerUserId === userId &&
    noteState.ownerUserId === userId
  ) {
    if (resetInFlight) await resetInFlight;
    if (useNoteStore.getState().sessionReady) return false;
  }

  const persistedOwner = readPersistedOwner();
  const freshClientState =
    treeState.generation === 0 && noteState.generation === 0;
  if (
    freshClientState &&
    (!persistedOwner.known || persistedOwner.userId === userId)
  ) {
    adoptWorkspaceSession(userId);
    return false;
  }

  await resetWorkspaceClientState(userId);
  return true;
}
