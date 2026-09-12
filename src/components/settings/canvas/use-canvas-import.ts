import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  LS_ACTIVE_JOB,
  LS_ERRORS,
  LS_FORBIDDEN,
  LS_SYNCED,
} from "./canvas-helpers";
import { toFriendlyCanvasError } from "@/lib/friendly-errors";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useLayoutStore from "@/lib/notes/state/layout.zustand";

interface UseCanvasImportParams {
  selectedCourseIds: string[];
  courses: {
    id: string;
    name: string;
    course_code: string;
    term?: string | { id?: string; name?: string } | null;
    canvasStatus?: string;
  }[];
  courseErrors: Record<string, string>;
  setCourseErrors: Dispatch<SetStateAction<Record<string, string>>>;
  forbiddenCourses: Record<string, boolean>;
  setForbiddenCourses: Dispatch<SetStateAction<Record<string, boolean>>>;
  syncedCourses: Record<string, boolean>;
  setSyncedCourses: Dispatch<SetStateAction<Record<string, boolean>>>;
  setConnectionError: Dispatch<SetStateAction<string | null>>;
  t: (key: string) => string;
}

interface CanvasProgress {
  percent: number;
  completed: number;
  total: number;
  downloading: number;
  processing: number;
}

interface CanvasLog {
  status?: string;
  courseId?: string | number;
  treePath?: string[];
}

interface CanvasStatusResponse {
  activeJob?: {
    jobId?: string;
    phase?: string;
    status?: string;
    jobType?: string;
  } | null;
  latestJob?: {
    jobId?: string;
    status?: string;
    jobType?: string;
    errorMessage?: string | null;
  } | null;
  progress?: CanvasProgress | null;
  markerColdStarting?: boolean;
  estimatedSecsRemaining?: number | null;
  recentLogs?: CanvasLog[];
  publishedJobId?: string | null;
  publishedTreePaths?: string[][];
  issues?: { forbidden?: number; error?: number };
}

function getStoredActiveJobId(): string | null {
  try {
    const storedJob: unknown = JSON.parse(
      localStorage.getItem(LS_ACTIVE_JOB) ?? "null",
    );
    if (
      typeof storedJob === "object" &&
      storedJob !== null &&
      "jobId" in storedJob &&
      typeof storedJob.jobId === "string"
    ) {
      return storedJob.jobId;
    }
  } catch {
    localStorage.removeItem(LS_ACTIVE_JOB);
  }
  return null;
}

function transitionStoredActiveJob(
  expectedJobId: string,
  nextJobId: string | null,
): string | null {
  const currentJobId = getStoredActiveJobId();
  if (currentJobId !== expectedJobId) return currentJobId;

  if (nextJobId) {
    localStorage.setItem(LS_ACTIVE_JOB, JSON.stringify({ jobId: nextJobId }));
  } else {
    localStorage.removeItem(LS_ACTIVE_JOB);
  }
  return nextJobId;
}

async function refreshOpenNotes(): Promise<void> {
  const noteStore = useNoteStore.getState();
  const layoutStore = useLayoutStore.getState();
  const refreshPromises = [];
  if (layoutStore.paneA?.fileId && layoutStore.paneA.fileType === "note") {
    refreshPromises.push(noteStore.fetchNote(layoutStore.paneA.fileId));
  }
  if (layoutStore.paneB?.fileId && layoutStore.paneB.fileType === "note") {
    refreshPromises.push(noteStore.fetchNote(layoutStore.paneB.fileId));
  }
  await Promise.allSettled(refreshPromises);
}

export default function useCanvasImport({
  selectedCourseIds,
  courses,
  courseErrors,
  setCourseErrors,
  forbiddenCourses,
  setForbiddenCourses,
  syncedCourses,
  setSyncedCourses,
  setConnectionError,
  t,
}: UseCanvasImportParams) {
  const [isImporting, setIsImporting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    forbidden: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const [progress, setProgress] = useState<{
    percent: number;
    completed: number;
    total: number;
    downloading: number;
    processing: number;
  } | null>(null);
  const [recentLogs, setRecentLogs] = useState<CanvasLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [markerColdStarting, setMarkerColdStarting] = useState(false);
  const [estimatedSecsRemaining, setEstimatedSecsRemaining] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRequestRef = useRef<AbortController | null>(null);
  const pollingRef = useRef(false);
  const trackedJobIdRef = useRef<string | null>(null);
  const latestStateRef = useRef({
    courses,
    forbiddenCourses,
    selectedCourseIds,
    syncedCourses,
  });

  useEffect(() => {
    latestStateRef.current = {
      courses,
      forbiddenCourses,
      selectedCourseIds,
      syncedCourses,
    };
  }, [courses, forbiddenCourses, selectedCourseIds, syncedCourses]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    pollingRef.current = false;
    pollRequestRef.current?.abort();
    pollRequestRef.current = null;
  }, []);

  const startPolling = useCallback((jobId?: string) => {
    const nextJobId = jobId ?? getStoredActiveJobId();
    if (nextJobId) trackedJobIdRef.current = nextJobId;
    if (pollingRef.current) return;
    pollingRef.current = true;
    setIsImporting(true);

    const poll = async (): Promise<void> => {
      if (!pollingRef.current) return;
      const controller = new AbortController();
      pollRequestRef.current = controller;
      try {
        const requestedPublishJobId = trackedJobIdRef.current;
        const statusUrl = requestedPublishJobId
          ? `/api/canvas/status?publishJobId=${encodeURIComponent(requestedPublishJobId)}`
          : "/api/canvas/status";
        const res = await fetch(statusUrl, {
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;
        const data = (await res.json()) as CanvasStatusResponse;
        if (controller.signal.aborted || !pollingRef.current) return;

        const logs = data.recentLogs ?? [];
        const activeJobId = data.activeJob?.jobId ?? null;
        const isTrackedTerminal =
          requestedPublishJobId !== null &&
          data.publishedJobId === requestedPublishJobId;
        const publicationIsLatest =
          isTrackedTerminal &&
          data.latestJob?.jobId === requestedPublishJobId;

        if (isTrackedTerminal) {
          const publishedTreePaths = Array.isArray(data.publishedTreePaths)
            ? data.publishedTreePaths
            : [];
          const terminalTreePaths = (
            publishedTreePaths.length > 0
              ? publishedTreePaths
              : publicationIsLatest
                ? logs.map((log) => log.treePath ?? [])
                : []
          ).filter((path) => path.length > 0);

          // A terminal job is acknowledged only after its durable branches
          // and any open note have consumed the completed import.
          if (terminalTreePaths.length > 0) {
            await useNoteTreeStore
              .getState()
              .refreshTreePaths(terminalTreePaths);
          }
          await refreshOpenNotes();

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
        }

        if (
          activeJobId &&
          (trackedJobIdRef.current === null ||
            trackedJobIdRef.current === activeJobId)
        ) {
          trackedJobIdRef.current = activeJobId;
        }

        setIsDiscovering(data.activeJob?.phase === "discovering");
        setProgress(data.progress ?? null);
        setMarkerColdStarting(Boolean(data.markerColdStarting));
        setEstimatedSecsRemaining(data.estimatedSecsRemaining ?? null);
        setRecentLogs(logs);

        // track which courses have forbidden files — persist permanently
        const newForbidden = { ...latestStateRef.current.forbiddenCourses };
        let forbiddenChanged = false;
        for (const log of logs) {
          if (log.status === "forbidden" && log.courseId) {
            const key = String(log.courseId);
            if (!newForbidden[key]) {
              newForbidden[key] = true;
              forbiddenChanged = true;
            }
          }
        }
        if (forbiddenChanged) {
          latestStateRef.current.forbiddenCourses = newForbidden;
          setForbiddenCourses(newForbidden);
          localStorage.setItem(LS_FORBIDDEN, JSON.stringify(newForbidden));
        }

        if (!data.activeJob) {
          if (!publicationIsLatest) {
            const latestTreePaths = logs
              .map((log) => log.treePath ?? [])
              .filter((path) => path.length > 0);
            if (latestTreePaths.length > 0) {
              await useNoteTreeStore
                .getState()
                .refreshTreePaths(latestTreePaths);
            }
            if (data.latestJob && !isTrackedTerminal) {
              await refreshOpenNotes();
            }
          }

          const awaitingNextPublication =
            trackedJobIdRef.current !== null &&
            trackedJobIdRef.current !== requestedPublishJobId;
          if (awaitingNextPublication) {
            setIsImporting(true);
          } else {
            stopPolling();
            setIsImporting(false);
          }
          setIsDiscovering(false);
          setMarkerColdStarting(false);
          setEstimatedSecsRemaining(null);
          if (data.latestJob?.status === "complete" && data.progress) {
            setImportSummary({
              imported: data.progress.completed,
              forbidden: data.issues?.forbidden ?? 0,
              failed: data.issues?.error ?? 0,
              skipped: 0,
            });
            // mark selected courses as synced
            const newSynced = { ...latestStateRef.current.syncedCourses };
            for (const course of latestStateRef.current.courses) {
              if (
                course.canvasStatus !== "inaccessible" &&
                course.canvasStatus !== "unavailable" &&
                latestStateRef.current.selectedCourseIds.includes(String(course.id))
              ) {
                newSynced[String(course.id)] = true;
              }
            }
            latestStateRef.current.syncedCourses = newSynced;
            setSyncedCourses(newSynced);
            localStorage.setItem(LS_SYNCED, JSON.stringify(newSynced));
          } else {
            setProgress(null);
            setImportSummary(null);
            if (data.latestJob?.status === "failed") {
              setConnectionError(
                data.latestJob.errorMessage ?? t("Import failed"),
              );
            } else if (data.latestJob?.status === "cancelled") {
              setConnectionError(t("Import cancelled."));
            }
          }
        }
      } catch {
        // Keep polling after transient errors. A cancellation is expected
        // when changing jobs or leaving settings.
      } finally {
        if (pollRequestRef.current === controller) {
          pollRequestRef.current = null;
        }
        // Poll only after this snapshot has settled: a slow Marker/OCR status
        // response must never overtake a later request.
        if (pollingRef.current && !controller.signal.aborted) {
          pollRef.current = setTimeout(() => {
            void poll();
          }, 2_000);
        }
      }
    };

    void poll();
  }, [
    setForbiddenCourses,
    setSyncedCourses,
    setConnectionError,
    t,
    stopPolling,
  ]);

  // cleanup polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleImport = useCallback(async () => {
    if (selectedCourseIds.length === 0) return;

    // Treat Canvas availability as an upstream constraint, independent from
    // local sync/error badges or stale browser selection state.
    const selectedCourses = courses
      .filter(
        (course) =>
          course.canvasStatus !== "inaccessible" &&
          course.canvasStatus !== "unavailable" &&
          selectedCourseIds.includes(String(course.id)),
      )
      .map((course) => ({
        id: String(course.id),
        name: course.name,
        course_code: course.course_code,
        term: course.term ?? null,
      }));
    if (selectedCourses.length === 0) return;

    setIsImporting(true);
    setIsDiscovering(true);
    setImportSummary(null);
    setProgress({
      percent: 0,
      completed: 0,
      total: 0,
      downloading: 0,
      processing: 0,
    });
    setRecentLogs([]);

    try {
      // send full course objects so the worker can use name/course_code/term for folder titles
      const res = await fetch("/api/canvas/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: selectedCourses }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setConnectionError(
            t("Your session has expired. Please log in again."),
          );
          setIsImporting(false);
          return;
        }
        if (res.status === 403 && data.courseId) {
          const updated = {
            ...courseErrors,
            [data.courseId]: toFriendlyCanvasError(data.error ?? "forbidden"),
          };
          setCourseErrors(updated);
          localStorage.setItem(LS_ERRORS, JSON.stringify(updated));
        }
        setConnectionError(
          toFriendlyCanvasError(data.error ?? "import failed"),
        );
        setIsImporting(false);
        return;
      }

      // persist the jobId so progress survives a page reload
      localStorage.setItem(
        LS_ACTIVE_JOB,
        JSON.stringify({
          jobId: data.jobId,
          startedAt: new Date().toISOString(),
        }),
      );

      startPolling(data.jobId);
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
      setIsImporting(false);
    }
  }, [
    selectedCourseIds,
    courses,
    courseErrors,
    setCourseErrors,
    setConnectionError,
    t,
    startPolling,
  ]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setImportSummary(null);
    setRecentLogs([]);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST" });
      const data = await res.json();
      if (res.status === 401) {
        setConnectionError(
          t("Your session has expired. Please log in again."),
        );
        return;
      }
      if (!res.ok || !data.queued) {
        setConnectionError(
          toFriendlyCanvasError(data.error ?? data.reason ?? "sync failed"),
        );
        return;
      }
      localStorage.setItem(
        LS_ACTIVE_JOB,
        JSON.stringify({
          jobId: data.jobId,
          startedAt: new Date().toISOString(),
        }),
      );
      setIsImporting(true);
      setIsDiscovering(true);
      setProgress({
        percent: 0,
        completed: 0,
        total: 0,
        downloading: 0,
        processing: 0,
      });
      startPolling(data.jobId);
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
    } finally {
      setIsSyncing(false);
    }
  }, [setConnectionError, t, startPolling]);

  const handleCancel = useCallback(async () => {
    try {
      const res = await fetch("/api/canvas/import", { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.cancelled) {
        stopPolling();
        setIsImporting(false);
        setIsDiscovering(false);
        setMarkerColdStarting(false);
        localStorage.removeItem(LS_ACTIVE_JOB);
        trackedJobIdRef.current = null;
        setImportSummary(null);
      }
    } catch {
      // polling will eventually detect the cancelled state
    }
  }, [stopPolling]);

  return {
    isImporting,
    setIsImporting,
    isDiscovering,
    setIsDiscovering,
    importSummary,
    setImportSummary,
    progress,
    setProgress,
    recentLogs,
    setRecentLogs,
    isSyncing,
    markerColdStarting,
    setMarkerColdStarting,
    estimatedSecsRemaining,
    setEstimatedSecsRemaining,
    handleImport,
    handleSync,
    handleCancel,
    startPolling,
    stopPolling,
  };
}
