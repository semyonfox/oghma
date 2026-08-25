import { useState, useEffect, useCallback, useRef } from "react";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import useNoteTreeStore from "@/lib/notes/state/tree";

const LS_ACTIVE_JOB = "canvas_active_job";
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000;
const STATUS_POLL_INTERVAL = 4_000;
const TREE_SYNC_DELAY = 750;

type StoredJob = { jobId?: string };
type ImportProgress = {
  total?: number;
  percent?: number;
  completed?: number;
  [key: string]: unknown;
};
type CanvasJobStatus = {
  jobId?: string;
  status?: string;
  jobType?: string;
  created_at?: string;
  createdAt?: string;
  errorMessage?: string | null;
};
type CanvasLog = {
  noteId?: string | null;
  status?: string;
  treePath?: string[];
};
type StatusData = {
  success?: boolean;
  activeJob?: CanvasJobStatus | null;
  latestJob?: CanvasJobStatus | null;
  recentLogs?: CanvasLog[];
  progress?: ImportProgress;
  issues?: { forbidden?: number; error?: number };
};
type StatusRequest = { promise: Promise<void> | null };

function getStoredActiveJob(): StoredJob | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(LS_ACTIVE_JOB) ?? "null",
    );
    return typeof value === "object" && value !== null
      ? (value as StoredJob)
      : null;
  } catch {
    localStorage.removeItem(LS_ACTIVE_JOB);
    return null;
  }
}

function isActiveCanvasStatus(status: string | undefined): boolean {
  return (
    status === "queued" || status === "discovering" || status === "processing"
  );
}

function isVisibleWhileProcessing(status: string | undefined): boolean {
  return (
    status === "indexing" ||
    status === "processing" ||
    status === "pending_marker" ||
    status === "pending_retry"
  );
}

/**
 * Tracks Canvas import status and shows notifications.
 *
 * Source notes are durable before OCR and embeddings complete. Status
 * snapshots therefore merge only the published branches into the sidebar,
 * rather than repeatedly rebuilding the whole lazy-loaded tree.
 */
export function useCanvasImportStatus(
  options: { autoCheckOnMount?: boolean } = {},
) {
  const { autoCheckOnMount = true } = options;

  const [progress, setProgress] = useState<
    (ImportProgress & { jobType: string; forbidden: number; error: number }) | null
  >(null);
  const [showToast, setShowToast] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const autoSyncTriggered = useRef(false);
  const seenRecentLogNoteIds = useRef(new Set<string>());
  const observedJobId = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const statusRequestRef = useRef<StatusRequest | null>(null);
  const treeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeSyncInFlightRef = useRef(false);
  const pendingTreePathsRef = useRef(new Map<string, string[]>());
  const mountedRef = useRef(true);

  // Remember a manual dismissal so status polling does not reopen it.
  const dismissedRef = useRef(false);
  const wasActiveRef = useRef(false);

  const scheduleTreeSync = useCallback(
    (logs: CanvasLog[], immediate = false) => {
      for (const log of logs) {
        const treePath = Array.isArray(log.treePath)
          ? log.treePath.filter((id) => typeof id === "string" && id.length > 0)
          : [];
        // A missing path means the durable tree row is not observable yet.
        // Do not turn it into a root refresh on every progress snapshot; the
        // next response with a real path will publish the affected branch.
        if (treePath.length === 0) continue;
        const key = treePath.join("/");
        pendingTreePathsRef.current.set(key, treePath);
      }

      if (pendingTreePathsRef.current.size === 0) return;
      if (immediate && treeSyncTimerRef.current) {
        clearTimeout(treeSyncTimerRef.current);
        treeSyncTimerRef.current = null;
      }
      if (treeSyncTimerRef.current || treeSyncInFlightRef.current) return;

      const flush = async (): Promise<void> => {
        treeSyncTimerRef.current = null;
        if (!mountedRef.current || treeSyncInFlightRef.current) return;

        const paths = [...pendingTreePathsRef.current.values()];
        pendingTreePathsRef.current.clear();
        if (paths.length === 0) return;

        treeSyncInFlightRef.current = true;
        try {
          await useNoteTreeStore.getState().refreshTreePaths(paths);
        } finally {
          treeSyncInFlightRef.current = false;
          if (
            mountedRef.current &&
            pendingTreePathsRef.current.size > 0 &&
            !treeSyncTimerRef.current
          ) {
            treeSyncTimerRef.current = setTimeout(() => {
              void flush();
            }, TREE_SYNC_DELAY);
          }
        }
      };

      treeSyncTimerRef.current = setTimeout(
        () => void flush(),
        immediate ? 0 : TREE_SYNC_DELAY,
      );
    },
    [],
  );

  const checkStatus = useCallback(async (): Promise<void> => {
    const existingRequest = statusRequestRef.current?.promise;
    if (existingRequest) return existingRequest;

    const controller = new AbortController();
    abortRef.current = controller;
    const requestSlot: StatusRequest = { promise: null };
    statusRequestRef.current = requestSlot;
    const request = (async (): Promise<void> => {
      try {
        const res = await fetch("/api/canvas/status", {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusData;
        if (!data.success || controller.signal.aborted || !mountedRef.current) return;

        const jobId = data.activeJob?.jobId ?? data.latestJob?.jobId ?? null;
        if (jobId && observedJobId.current !== jobId) {
          observedJobId.current = jobId;
          seenRecentLogNoteIds.current.clear();
          pendingTreePathsRef.current.clear();
        }

        const active = isActiveCanvasStatus(data.activeJob?.status);
        setIsImporting(active);
        if (active && !wasActiveRef.current) dismissedRef.current = false;
        wasActiveRef.current = active;

        const logs = Array.isArray(data.recentLogs) ? data.recentLogs : [];
        const newNoteIds: string[] = [];
        const newlyVisibleLogs: CanvasLog[] = [];
        for (const log of logs) {
          const noteId = log.noteId;
          if (
            !noteId ||
            !["indexing", "complete"].includes(log.status ?? "") ||
            seenRecentLogNoteIds.current.has(noteId)
          ) {
            continue;
          }
          seenRecentLogNoteIds.current.add(noteId);
          newNoteIds.push(noteId);
          newlyVisibleLogs.push(log);
        }

        if (newNoteIds.length > 0) {
          useSyncStatusStore.getState().markCanvasNew(newNoteIds);
          scheduleTreeSync(newlyVisibleLogs);
        }

        // The Markdown companion can be created while the source row remains
        // indexing, so revisit only active branches on later snapshots.
        const activeBranches = logs.filter((log) =>
          isVisibleWhileProcessing(log.status),
        );
        if (activeBranches.length > 0) scheduleTreeSync(activeBranches);

        const jobType =
          data.activeJob?.jobType ?? data.latestJob?.jobType ?? "import";
        if (active) {
          setProgress({
            ...data.progress,
            jobType,
            forbidden: data.issues?.forbidden ?? 0,
            error: data.issues?.error ?? 0,
          });
          setShowToast(!dismissedRef.current);
          return;
        }

        if (logs.length > 0) scheduleTreeSync(logs, true);
        if (
          data.latestJob?.status === "complete" &&
          (data.progress?.total ?? 0) > 0 &&
          data.progress?.percent === 100
        ) {
          setProgress({
            ...data.progress,
            jobType,
            forbidden: data.issues?.forbidden ?? 0,
            error: data.issues?.error ?? 0,
          });
          setShowToast(!dismissedRef.current);
        } else {
          setShowToast(false);
        }
        localStorage.removeItem(LS_ACTIVE_JOB);
      } catch (error: unknown) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          controller.signal.aborted
        ) {
          return;
        }
        console.error("Failed to check Canvas import status:", error);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (statusRequestRef.current === requestSlot) {
          statusRequestRef.current = null;
        }
      }
    })();

    requestSlot.promise = request;
    return request;
  }, [scheduleTreeSync]);

  const maybeAutoSync = useCallback(async () => {
    if (autoSyncTriggered.current) return;
    try {
      const res = await fetch("/api/canvas/sync");
      const data = (await res.json()) as {
        available?: boolean;
        activeJob?: { created_at?: string };
      };
      if (!data.available) return;

      const lastSync = data.activeJob?.created_at;
      if (
        lastSync &&
        Date.now() - new Date(lastSync).getTime() < AUTO_SYNC_INTERVAL
      ) {
        return;
      }

      autoSyncTriggered.current = true;
      const syncRes = await fetch("/api/canvas/sync", { method: "POST" });
      const syncData = (await syncRes.json()) as {
        queued?: boolean;
        jobId?: string;
      };
      if (syncData.queued) {
        localStorage.setItem(
          LS_ACTIVE_JOB,
          JSON.stringify({ jobId: syncData.jobId }),
        );
        setIsImporting(true);
        setShowToast(true);
      }
    } catch {
      // Auto-sync is best-effort.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (treeSyncTimerRef.current) clearTimeout(treeSyncTimerRef.current);
      abortRef.current?.abort();
    };
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

    return () => window.clearTimeout(timer);
  }, [autoCheckOnMount, checkStatus, maybeAutoSync]);

  // Poll again only once the current request settles. This avoids slow OCR
  // responses racing each other and triggering rapid/out-of-order tree work.
  useEffect(() => {
    if (!isImporting) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      await checkStatus();
      if (!cancelled) timer = setTimeout(poll, STATUS_POLL_INTERVAL);
    };
    timer = setTimeout(poll, STATUS_POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
