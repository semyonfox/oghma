import { useState, useEffect, useCallback, useRef } from "react";
import {
  DEFAULT_CANVAS_POLL_MS,
  canvasPollInterval,
  fetchCanvasStatus,
} from "@/lib/canvas/status-poll";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useLayoutStore from "@/lib/notes/state/layout.zustand";

const LS_ACTIVE_JOB = "canvas_active_job";
const TREE_SYNC_DELAY = 750;
const MAX_TREE_SYNC_RETRIES = 3;

type StoredJob = { jobId?: string };
export type CanvasImportProgress = {
  total: number;
  percent: number;
  completed: number;
  downloading: number;
  processing: number;
  jobType: string;
  forbidden: number;
  error: number;
  failed?: boolean;
  [key: string]: unknown;
};
export type CanvasJobStatus = {
  jobId?: string;
  status?: string;
  jobType?: string;
  created_at?: string;
  createdAt?: string;
  errorMessage?: string | null;
  phase?: string;
};
export type CanvasImportLog = {
  noteId?: string | null;
  status?: string;
  treePath?: string[];
  courseId?: string | number | null;
  filename?: string;
  errorMessage?: string | null;
  updatedAt?: string;
};
export type CanvasStatusData = {
  success?: boolean;
  activeJob?: CanvasJobStatus | null;
  latestJob?: CanvasJobStatus | null;
  recentLogs?: CanvasImportLog[];
  publishedJobId?: string | null;
  publishedNoteCount?: number;
  publishedTreePaths?: string[][];
  pollIntervalMs?: number;
  progress?: Partial<CanvasImportProgress>;
  issues?: { forbidden?: number; error?: number; stopped?: number };
  discovery?: {
    completedCourses: number;
    totalCourses: number;
    stage: string;
    filesFound: number;
    skippedCourses?: string[];
    skippedFolders?: string[];
  } | null;
  retryableFiles?: number;
  markerColdStarting?: boolean;
  estimatedSecsRemaining?: number | null;
};
type StatusRequest = { promise: Promise<void> | null };

export type CanvasImportSummary = {
  imported: number;
  forbidden: number;
  failed: number;
  skipped: number;
};

function normalizedProgress(
  data: CanvasStatusData,
  jobType: string,
  failed = false,
): CanvasImportProgress {
  return {
    ...data.progress,
    total: data.progress?.total ?? 0,
    percent: data.progress?.percent ?? 0,
    completed: data.progress?.completed ?? 0,
    downloading: data.progress?.downloading ?? 0,
    processing: data.progress?.processing ?? 0,
    jobType,
    forbidden: data.issues?.forbidden ?? 0,
    error: data.issues?.error ?? 0,
    ...(failed ? { failed: true } : {}),
  };
}

async function refreshOpenNotes(): Promise<void> {
  const noteStore = useNoteStore.getState();
  const layoutStore = useLayoutStore.getState();
  const noteIds = new Set<string>();
  if (layoutStore.paneA?.fileId && layoutStore.paneA.fileType === "note") {
    noteIds.add(layoutStore.paneA.fileId);
  }
  if (layoutStore.paneB?.fileId && layoutStore.paneB.fileType === "note") {
    noteIds.add(layoutStore.paneB.fileId);
  }
  await Promise.all(
    [...noteIds].map((noteId) =>
      noteStore.fetchNote(noteId, { forceFresh: true }),
    ),
  );
}

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

function transitionStoredActiveJob(
  expectedJobId: string,
  nextJobId: string | null,
): string | null {
  const currentJobId = getStoredActiveJob()?.jobId ?? null;
  if (currentJobId !== expectedJobId) return currentJobId;

  if (nextJobId) {
    localStorage.setItem(LS_ACTIVE_JOB, JSON.stringify({ jobId: nextJobId }));
  } else {
    localStorage.removeItem(LS_ACTIVE_JOB);
  }
  return nextJobId;
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
    status === "pending_retry" ||
    status === "pending_cache"
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
  options: { autoCheckOnMount?: boolean; enabled?: boolean } = {},
) {
  const { autoCheckOnMount = true, enabled = true } = options;

  const [progress, setProgress] = useState<CanvasImportProgress | null>(null);
  const pollIntervalRef = useRef(DEFAULT_CANVAS_POLL_MS);
  const [showToast, setShowToast] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [recentLogs, setRecentLogs] = useState<CanvasImportLog[]>([]);
  const [importSummary, setImportSummary] =
    useState<CanvasImportSummary | null>(null);
  const [markerColdStarting, setMarkerColdStarting] = useState(false);
  const [estimatedSecsRemaining, setEstimatedSecsRemaining] = useState<
    number | null
  >(null);
  const [statusSnapshot, setStatusSnapshot] =
    useState<CanvasStatusData | null>(null);
  const autoSyncTriggered = useRef(false);
  const seenRecentLogNoteIds = useRef(new Set<string>());
  const observedJobId = useRef<string | null>(null);
  const trackedJobIdRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const autoSyncAbortRef = useRef<AbortController | null>(null);
  const statusRequestRef = useRef<StatusRequest | null>(null);
  const treeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeSyncInFlightRef = useRef<Promise<void> | null>(null);
  const pendingTreePathsRef = useRef(new Map<string, string[]>());
  const appliedTerminalPathKeysRef = useRef(new Set<string>());
  const treeSyncRetryCountRef = useRef(0);
  const ownerGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  // Remember a manual dismissal so status polling does not reopen it.
  const dismissedRef = useRef(false);
  const wasActiveRef = useRef(false);

  const runTreeSync = useCallback(async (paths: string[][], generation: number) => {
    // A terminal refresh must run after any older snapshot. Rechecking in a
    // loop also serializes multiple waiters that resume on the same promise.
    while (treeSyncInFlightRef.current) {
      await treeSyncInFlightRef.current;
    }
    if (!mountedRef.current || ownerGenerationRef.current !== generation) {
      return false;
    }

    const refresh = useNoteTreeStore.getState().refreshTreePaths(paths);
    treeSyncInFlightRef.current = refresh;
    try {
      await refresh;
      return mountedRef.current && ownerGenerationRef.current === generation;
    } finally {
      if (treeSyncInFlightRef.current === refresh) {
        treeSyncInFlightRef.current = null;
      }
    }
  }, []);

  const scheduleTreeSync = useCallback(
    (logs: CanvasImportLog[], immediate = false) => {
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

      const generation = ownerGenerationRef.current;
      const flush = async (): Promise<void> => {
        treeSyncTimerRef.current = null;
        if (
          !mountedRef.current ||
          ownerGenerationRef.current !== generation ||
          treeSyncInFlightRef.current
        ) {
          return;
        }

        const paths = [...pendingTreePathsRef.current.values()];
        if (paths.length === 0) return;

        try {
          const applied = await runTreeSync(paths, generation);
          if (!applied) return;
          for (const path of paths) {
            pendingTreePathsRef.current.delete(path.join("/"));
          }
          treeSyncRetryCountRef.current = 0;
        } catch (error) {
          treeSyncRetryCountRef.current += 1;
          console.error("Failed to refresh Canvas note branches:", error);
        } finally {
          if (
            mountedRef.current &&
            ownerGenerationRef.current === generation &&
            pendingTreePathsRef.current.size > 0 &&
            !treeSyncTimerRef.current &&
            treeSyncRetryCountRef.current <= MAX_TREE_SYNC_RETRIES
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
    [runTreeSync],
  );

  const refreshTerminalTree = useCallback(
    async (logs: CanvasImportLog[]) => {
      const pathsByKey = new Map<string, string[]>();
      for (const log of logs) {
        const treePath = Array.isArray(log.treePath)
          ? log.treePath.filter(
              (id) => typeof id === "string" && id.length > 0,
            )
          : [];
        if (treePath.length > 0) pathsByKey.set(treePath.join("/"), treePath);
      }
      for (const [key, path] of pendingTreePathsRef.current) {
        pathsByKey.set(key, path);
      }
      if (pathsByKey.size === 0) return true;

      // A terminal publication is acknowledged only after the affected tree
      // branches have actually been refreshed. Cancel any queued batch so the
      // same paths are not replayed after the job token is cleared.
      if (treeSyncTimerRef.current) {
        clearTimeout(treeSyncTimerRef.current);
        treeSyncTimerRef.current = null;
      }
      const generation = ownerGenerationRef.current;
      const paths = [...pathsByKey.values()];
      try {
        const applied = await runTreeSync(paths, generation);
        if (!applied) return false;
        for (const path of paths) {
          pendingTreePathsRef.current.delete(path.join("/"));
        }
        treeSyncRetryCountRef.current = 0;
        return true;
      } catch (error) {
        treeSyncRetryCountRef.current += 1;
        for (const path of paths) {
          pendingTreePathsRef.current.set(path.join("/"), path);
        }
        console.error("Failed to publish completed Canvas branches:", error);
        return false;
      }
    },
    [runTreeSync],
  );

  const checkStatus = useCallback(async (): Promise<void> => {
    if (!enabled || !mountedRef.current) return;
    const existingRequest = statusRequestRef.current?.promise;
    if (existingRequest) return existingRequest;

    const generation = ownerGenerationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSlot: StatusRequest = { promise: null };
    statusRequestRef.current = requestSlot;
    const request = (async (): Promise<void> => {
      try {
        const storedJobId = getStoredActiveJob()?.jobId;
        if (storedJobId && storedJobId !== trackedJobIdRef.current) {
          trackedJobIdRef.current = storedJobId;
        }
        const requestedPublishJobId = trackedJobIdRef.current;
        const statusUrl = requestedPublishJobId
          ? `/api/canvas/status?publishJobId=${encodeURIComponent(requestedPublishJobId)}`
          : "/api/canvas/status";
        const res = await fetchCanvasStatus(statusUrl, controller.signal);
        if (!res.ok) return;
        const data = (await res.json()) as CanvasStatusData;
        pollIntervalRef.current = canvasPollInterval(data.pollIntervalMs);
        if (
          !data.success ||
          controller.signal.aborted ||
          !mountedRef.current ||
          ownerGenerationRef.current !== generation
        ) {
          return;
        }

        const logs = Array.isArray(data.recentLogs) ? data.recentLogs : [];
        const activeJobId =
          data.activeJob?.jobId && isActiveCanvasStatus(data.activeJob.status)
            ? data.activeJob.jobId
            : null;
        const isTrackedTerminal =
          requestedPublishJobId !== null &&
          data.publishedJobId === requestedPublishJobId;
        const publicationIsLatest =
          isTrackedTerminal &&
          data.latestJob?.jobId === requestedPublishJobId;

        if (isTrackedTerminal) {
          const publishedTreePathsByKey = new Map<string, string[]>();
          if (Array.isArray(data.publishedTreePaths)) {
            for (const candidate of data.publishedTreePaths) {
              const path = Array.isArray(candidate)
                ? candidate.filter(
                    (id) => typeof id === "string" && id.length > 0,
                  )
                : [];
              if (path.length > 0) {
                publishedTreePathsByKey.set(path.join("/"), path);
              }
            }
          }
          const unresolvedPublishedNotes =
            typeof data.publishedNoteCount === "number" &&
            data.publishedNoteCount > publishedTreePathsByKey.size;
          const publishedTreeLogs = [...publishedTreePathsByKey]
            .filter(([key]) => !appliedTerminalPathKeysRef.current.has(key))
            .map(([, treePath]) => ({ treePath }));
          const terminalTreeLogs =
            data.publishedNoteCount !== undefined ||
            publishedTreePathsByKey.size > 0
              ? publishedTreeLogs
              : publicationIsLatest
                ? logs
                : [];
          if (terminalTreeLogs.length > 0) {
            const terminalTreeApplied =
              await refreshTerminalTree(terminalTreeLogs);
            if (!terminalTreeApplied) {
              if (
                controller.signal.aborted ||
                !mountedRef.current ||
                ownerGenerationRef.current !== generation
              ) {
                return;
              }
              setIsImporting(true);
              return;
            }
            for (const log of publishedTreeLogs) {
              const key = log.treePath?.join("/");
              if (key) appliedTerminalPathKeysRef.current.add(key);
            }
          }

          if (unresolvedPublishedNotes) {
            setIsImporting(true);
            return;
          }

          try {
            await refreshOpenNotes();
          } catch (error) {
            if (
              controller.signal.aborted ||
              !mountedRef.current ||
              ownerGenerationRef.current !== generation
            ) {
              return;
            }
            console.error("Failed to refresh open Canvas notes:", error);
            setIsImporting(true);
            return;
          }

          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            ownerGenerationRef.current !== generation
          ) {
            return;
          }

          // A newer job can begin before the previous terminal snapshot is
          // consumed. Move the exact persisted token only after its branches
          // are visible, without overwriting a job changed by another tab.
          const successorJobId =
            activeJobId && activeJobId !== requestedPublishJobId
              ? activeJobId
              : data.latestJob?.jobId &&
                  data.latestJob.jobId !== requestedPublishJobId
                ? data.latestJob.jobId
                : null;
          const storedJobAfterPublication = transitionStoredActiveJob(
            requestedPublishJobId,
            successorJobId,
          );
          if (trackedJobIdRef.current === requestedPublishJobId) {
            trackedJobIdRef.current =
              storedJobAfterPublication ?? successorJobId;
          }
          appliedTerminalPathKeysRef.current.clear();
        }

        const jobId = data.activeJob?.jobId ?? data.latestJob?.jobId ?? null;
        if (jobId && observedJobId.current !== jobId) {
          observedJobId.current = jobId;
          seenRecentLogNoteIds.current.clear();
        }
        if (
          activeJobId &&
          (trackedJobIdRef.current === null ||
            trackedJobIdRef.current === activeJobId)
        ) {
          trackedJobIdRef.current = activeJobId;
          if (getStoredActiveJob()?.jobId !== activeJobId) {
            localStorage.setItem(
              LS_ACTIVE_JOB,
              JSON.stringify({ jobId: activeJobId }),
            );
          }
        }

        const active = isActiveCanvasStatus(data.activeJob?.status);
        const awaitingNextPublication =
          !active &&
          trackedJobIdRef.current !== null &&
          trackedJobIdRef.current !== requestedPublishJobId;
        setIsImporting(active || awaitingNextPublication);
        setIsDiscovering(data.activeJob?.phase === "discovering");
        setRecentLogs(logs);
        setMarkerColdStarting(Boolean(data.markerColdStarting));
        setEstimatedSecsRemaining(data.estimatedSecsRemaining ?? null);
        if (active && !wasActiveRef.current) dismissedRef.current = false;
        wasActiveRef.current = active;

        const newNoteIds: string[] = [];
        const newlyVisibleLogs: CanvasImportLog[] = [];
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
          if (!publicationIsLatest) scheduleTreeSync(newlyVisibleLogs);
        }

        // The Markdown companion can be created while the source row remains
        // indexing, so revisit only active branches on later snapshots.
        const activeBranches = logs.filter((log) =>
          isVisibleWhileProcessing(log.status),
        );
        if (activeBranches.length > 0 && !publicationIsLatest) {
          scheduleTreeSync(activeBranches);
        }

        const jobType =
          data.activeJob?.jobType ?? data.latestJob?.jobType ?? "import";
        if (active) {
          setProgress(normalizedProgress(data, jobType));
          setImportSummary(null);
          setStatusSnapshot(data);
          setShowToast(!dismissedRef.current);
          return;
        }

        if (!publicationIsLatest && logs.length > 0) {
          scheduleTreeSync(logs, true);
        }
        if (data.latestJob?.status === "failed") {
          setProgress(normalizedProgress(data, jobType, true));
          setImportSummary({
            imported: data.progress?.completed ?? 0,
            forbidden: data.issues?.forbidden ?? 0,
            failed: data.issues?.error ?? 0,
            skipped: data.issues?.stopped ?? 0,
          });
          setShowToast(!dismissedRef.current);
        } else if (
          data.latestJob?.status === "complete" &&
          (data.progress?.total ?? 0) > 0 &&
          data.progress?.percent === 100
        ) {
          const completedProgress = normalizedProgress(data, jobType);
          setProgress(completedProgress);
          setImportSummary({
            imported: completedProgress.completed,
            forbidden: completedProgress.forbidden,
            failed: completedProgress.error,
            skipped: data.issues?.stopped ?? 0,
          });
          setShowToast(!dismissedRef.current);
        } else if (data.latestJob?.status === "cancelled" && data.progress) {
          setProgress(normalizedProgress(data, jobType));
          setImportSummary({
            imported: data.progress.completed ?? 0,
            forbidden: data.issues?.forbidden ?? 0,
            failed: data.issues?.error ?? 0,
            skipped: data.issues?.stopped ?? 0,
          });
          setShowToast(!dismissedRef.current);
        } else {
          setProgress(null);
          setImportSummary(null);
          setShowToast(false);
        }
        setStatusSnapshot(data);
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
  }, [enabled, refreshTerminalTree, scheduleTreeSync]);

  const trackJob = useCallback((jobId: string, jobType = "import") => {
    ownerGenerationRef.current += 1;
    abortRef.current?.abort();
    autoSyncAbortRef.current?.abort();
    trackedJobIdRef.current = jobId;
    observedJobId.current = jobId;
    seenRecentLogNoteIds.current.clear();
    appliedTerminalPathKeysRef.current.clear();
    treeSyncRetryCountRef.current = 0;
    if (treeSyncTimerRef.current) {
      clearTimeout(treeSyncTimerRef.current);
      treeSyncTimerRef.current = null;
    }
    setProgress({
      total: 0,
      percent: 0,
      completed: 0,
      downloading: 0,
      processing: 0,
      jobType,
      forbidden: 0,
      error: 0,
    });
    setImportSummary(null);
    setRecentLogs([]);
    setMarkerColdStarting(false);
    setEstimatedSecsRemaining(null);
    setStatusSnapshot(null);
    setIsDiscovering(true);
    setIsImporting(true);
    setShowToast(true);
  }, []);

  const resetStatus = useCallback(() => {
    ownerGenerationRef.current += 1;
    abortRef.current?.abort();
    autoSyncAbortRef.current?.abort();
    trackedJobIdRef.current = null;
    observedJobId.current = null;
    seenRecentLogNoteIds.current.clear();
    appliedTerminalPathKeysRef.current.clear();
    pendingTreePathsRef.current.clear();
    treeSyncRetryCountRef.current = 0;
    if (treeSyncTimerRef.current) {
      clearTimeout(treeSyncTimerRef.current);
      treeSyncTimerRef.current = null;
    }
    setProgress(null);
    setImportSummary(null);
    setRecentLogs([]);
    setMarkerColdStarting(false);
    setEstimatedSecsRemaining(null);
    setStatusSnapshot(null);
    setIsDiscovering(false);
    setIsImporting(false);
    setShowToast(false);
  }, []);

  const maybeAutoSync = useCallback(async () => {
    if (
      !enabled ||
      !mountedRef.current ||
      autoSyncTriggered.current ||
      trackedJobIdRef.current !== null ||
      getStoredActiveJob()?.jobId
    ) {
      return;
    }
    const generation = ownerGenerationRef.current;
    const controller = new AbortController();
    autoSyncAbortRef.current?.abort();
    autoSyncAbortRef.current = controller;
    const canContinue = () =>
      enabled &&
      mountedRef.current &&
      !controller.signal.aborted &&
      ownerGenerationRef.current === generation;
    try {
      const res = await fetch("/api/canvas/sync", {
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        available?: boolean;
        activeJob?: { id?: string };
      };
      if (!canContinue() || !data.available) return;

      if (typeof data.activeJob?.id === "string") {
        localStorage.setItem(
          LS_ACTIVE_JOB,
          JSON.stringify({ jobId: data.activeJob.id }),
        );
        trackJob(data.activeJob.id, "sync");
        return;
      }

      const syncRes = await fetch("/api/canvas/sync?automatic=true", {
        method: "POST",
        signal: controller.signal,
      });
      const syncData = (await syncRes.json()) as {
        queued?: boolean;
        jobId?: string;
        activeJobId?: string;
      };
      if (!canContinue()) return;
      autoSyncTriggered.current = true;
      const jobId = syncData.queued
        ? syncData.jobId
        : syncData.activeJobId;
      if (typeof jobId === "string") {
        localStorage.setItem(
          LS_ACTIVE_JOB,
          JSON.stringify({ jobId }),
        );
        trackJob(jobId, "sync");
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      // Auto-sync is best-effort.
    } finally {
      if (autoSyncAbortRef.current === controller) {
        autoSyncAbortRef.current = null;
      }
    }
  }, [enabled, trackJob]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ownerGenerationRef.current += 1;
      if (treeSyncTimerRef.current) clearTimeout(treeSyncTimerRef.current);
      abortRef.current?.abort();
      autoSyncAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!autoCheckOnMount || !enabled) return;

    const savedJob = getStoredActiveJob();
    if (savedJob?.jobId) {
      queueMicrotask(() => {
        setIsImporting(true);
        setShowToast(true);
      });
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        await checkStatus();
        if (!cancelled) await maybeAutoSync();
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      autoSyncAbortRef.current?.abort();
    };
  }, [autoCheckOnMount, checkStatus, enabled, maybeAutoSync]);

  // Poll again only once the current request settles. This avoids slow OCR
  // responses racing each other and triggering rapid/out-of-order tree work.
  useEffect(() => {
    if (!enabled || !isImporting) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      await checkStatus();
      if (!cancelled) timer = setTimeout(poll, pollIntervalRef.current);
    };
    timer = setTimeout(poll, pollIntervalRef.current);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [enabled, isImporting, checkStatus]);

  return {
    progress,
    showToast,
    isImporting,
    isDiscovering,
    importSummary,
    recentLogs,
    markerColdStarting,
    estimatedSecsRemaining,
    statusSnapshot,
    discovery: statusSnapshot?.discovery ?? null,
    terminalStatus: statusSnapshot?.activeJob
      ? null
      : statusSnapshot?.latestJob?.status ?? null,
    retrySourceJobId:
      !statusSnapshot?.activeJob &&
      (statusSnapshot?.retryableFiles ?? 0) > 0
        ? statusSnapshot?.latestJob?.jobId ?? null
        : null,
    checkStatus,
    trackJob,
    resetStatus,
    onToastClose: () => {
      dismissedRef.current = true;
      setShowToast(false);
    },
  };
}
