import { useState, useEffect, useCallback, useRef } from "react";
import useSyncStatusStore from "@/lib/notes/state/sync-status";

const LS_ACTIVE_JOB = "canvas_active_job";
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

type StoredJob = { jobId?: string };
type ImportProgress = { total?: number; percent?: number; completed?: number; [key: string]: unknown };
type StatusData = {
  success?: boolean;
  activeJob?: { status?: string; jobType?: string; created_at?: string };
  recentLogs?: Array<{ noteId?: string; status?: string }>;
  progress?: ImportProgress;
  issues?: { forbidden?: number; error?: number };
};

function getStoredActiveJob(): StoredJob | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LS_ACTIVE_JOB) ?? "null");
    return typeof value === "object" && value !== null ? value as StoredJob : null;
  } catch {
    localStorage.removeItem(LS_ACTIVE_JOB);
    return null;
  }
}

/**
 * Hook to track Canvas import status and show notifications.
 * Mounted globally in providers so the toast persists across page navigation.
 *
 * Polls /api/canvas/status every 3s while a job is active.
 * Triggers auto-sync when canvas_auto_sync is enabled and last sync > 6h ago.
 */
export function useCanvasImportStatus(options: { autoCheckOnMount?: boolean } = {}) {
  const { autoCheckOnMount = true } = options;

  const [progress, setProgress] = useState<(ImportProgress & { jobType: string; forbidden: number; error: number }) | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const autoSyncTriggered = useRef(false);
  const seenRecentLogNoteIds = useRef(new Set());

  const abortRef = useRef<AbortController | null>(null);

  const dismissedRef = useRef(false);
  const wasActiveRef = useRef(false);

  const checkStatus = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/canvas/status", {
        signal: controller.signal,
      });
      const data = await res.json() as StatusData;

      if (!data.success) return;

      const active =
        data.activeJob?.status === "processing" ||
        data.activeJob?.status === "queued";
      setIsImporting(active);

      if (active && !wasActiveRef.current) {
        dismissedRef.current = false;
      }
      wasActiveRef.current = active;

      const collectNewRecentLogNoteIds = (allowedStatuses: Set<string>): string[] => {
        if (!Array.isArray(data.recentLogs)) return [];

        const nextNewNoteIds: string[] = [];

        for (const log of data.recentLogs) {
          const noteId = log?.noteId;
          if (!noteId || !log.status || !allowedStatuses.has(log.status)) continue;
          if (seenRecentLogNoteIds.current.has(noteId)) continue;

          seenRecentLogNoteIds.current.add(noteId);
          nextNewNoteIds.push(noteId);
        }

        return nextNewNoteIds;
      };

      const markAndRefreshNewNotes = async (newNoteIds: string[]) => {
        if (newNoteIds.length === 0) return;

        useSyncStatusStore.getState().markCanvasNew(newNoteIds);

        const { default: useNoteTreeStore } =
          await import("@/lib/notes/state/tree");
        useNoteTreeStore.getState().refreshTree();
      };

      if (active) {
        const newNoteIds = collectNewRecentLogNoteIds(
          new Set(["indexing", "complete"]),
        );
        await markAndRefreshNewNotes(newNoteIds);

        setProgress({
          ...data.progress,
          jobType: data.activeJob?.jobType ?? "import",
          forbidden: data.issues?.forbidden ?? 0,
          error: data.issues?.error ?? 0,
        });
        setShowToast(!dismissedRef.current);
      } else {
        if ((data.progress?.total ?? 0) > 0 && data.progress?.percent === 100) {
          setProgress({
            ...data.progress,
            jobType: data.activeJob?.jobType ?? "import",
            forbidden: data.issues?.forbidden ?? 0,
            error: data.issues?.error ?? 0,
          });
          setShowToast(!dismissedRef.current);
        } else {
          setShowToast(false);
        }

        localStorage.removeItem(LS_ACTIVE_JOB);

        const newNoteIds = collectNewRecentLogNoteIds(new Set(["complete"]));
        await markAndRefreshNewNotes(newNoteIds);
      }
    } catch (err: unknown) {
      if ((err instanceof DOMException && err.name === "AbortError") || controller.signal.aborted) return;
      console.error("Failed to check Canvas import status:", err);
    }
  }, []);

  const maybeAutoSync = useCallback(async () => {
    if (autoSyncTriggered.current) return;
    try {
      const res = await fetch("/api/canvas/sync");
      const data = await res.json() as { available?: boolean; activeJob?: { created_at?: string }; };
      if (!data.available) return;

      const lastSync = data.activeJob?.created_at;
      if (
        lastSync &&
        Date.now() - new Date(lastSync).getTime() < AUTO_SYNC_INTERVAL
      )
        return;

      autoSyncTriggered.current = true;
      const syncRes = await fetch("/api/canvas/sync", { method: "POST" });
      const syncData = await syncRes.json() as { queued?: boolean; jobId?: string };
      if (syncData.queued) {
        localStorage.setItem(
          LS_ACTIVE_JOB,
          JSON.stringify({ jobId: syncData.jobId }),
        );
        setIsImporting(true);
        setShowToast(true);
      }
    } catch {
      // auto-sync is best-effort
    }
  }, []);

  useEffect(() => {
    if (!autoCheckOnMount) return;

    const savedJob = getStoredActiveJob();
    if (savedJob?.jobId) {
      queueMicrotask(() => {
        setIsImporting(true);
        setShowToast(true);
      });
    }
    const timer = window.setTimeout(() => {
      void checkStatus();
      void maybeAutoSync();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [autoCheckOnMount, checkStatus, maybeAutoSync]);

  useEffect(() => {
    if (!isImporting) return;
    const interval = setInterval(checkStatus, 3000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [isImporting, checkStatus]);

  return {
    progress,
    showToast,
    isImporting,
    checkStatus,
    onToastClose: () => {
      dismissedRef.current = true;
      setShowToast(false);
    },
  };
}
