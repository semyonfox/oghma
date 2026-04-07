import { useState, useRef, useEffect, useCallback } from "react";
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
  selectedCourseIds: number[];
  courses: { id: number; name: string; course_code: string; term?: string }[];
  courseErrors: Record<string, string>;
  setCourseErrors: (v: Record<string, string>) => void;
  forbiddenCourses: Record<string, boolean>;
  setForbiddenCourses: (v: Record<string, boolean>) => void;
  syncedCourses: Record<string, boolean>;
  setSyncedCourses: (v: Record<string, boolean>) => void;
  setConnectionError: (v: string | null) => void;
  t: (key: string) => string;
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
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [markerColdStarting, setMarkerColdStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/canvas/status");
        const data = await res.json();
        if (!res.ok) return;

        setIsDiscovering(data.activeJob?.phase === "discovering");
        setProgress(data.progress);
        setMarkerColdStarting(Boolean(data.markerColdStarting));
        const logs = data.recentLogs ?? [];
        setRecentLogs(logs);

        // track which courses have forbidden files — persist permanently
        const newForbidden = { ...forbiddenCourses };
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
          setForbiddenCourses(newForbidden);
          localStorage.setItem(LS_FORBIDDEN, JSON.stringify(newForbidden));
        }

        if (!data.activeJob) {
          stopPolling();
          setIsImporting(false);
          setIsDiscovering(false);
          setMarkerColdStarting(false);
          localStorage.removeItem(LS_ACTIVE_JOB);
          if (data.progress) {
            setImportSummary({
              imported: data.progress.completed,
              forbidden: data.issues?.forbidden ?? 0,
              failed: data.issues?.error ?? 0,
              skipped: 0,
            });
            // mark selected courses as synced
            const newSynced = { ...syncedCourses };
            for (const id of selectedCourseIds) newSynced[String(id)] = true;
            setSyncedCourses(newSynced);
            localStorage.setItem(LS_SYNCED, JSON.stringify(newSynced));

            // auto-refresh filetree and open notes after sync completes
            const treeStore = useNoteTreeStore.getState();
            const noteStore = useNoteStore.getState();
            const layoutStore = useLayoutStore.getState();

            // refresh filetree to show new imported notes
            await treeStore.refreshTree();

            // refresh any open notes in editor panes
            const paneA = layoutStore.paneA;
            const paneB = layoutStore.paneB;
            const refreshPromises = [];
            if (paneA?.fileId && paneA.fileType === "note") {
              refreshPromises.push(noteStore.fetchNote(paneA.fileId));
            }
            if (paneB?.fileId && paneB.fileType === "note") {
              refreshPromises.push(noteStore.fetchNote(paneB.fileId));
            }
            await Promise.allSettled(refreshPromises);
          }
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000);
  }, [
    forbiddenCourses,
    setForbiddenCourses,
    syncedCourses,
    setSyncedCourses,
    selectedCourseIds,
    stopPolling,
  ]);

  // cleanup polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleImport = useCallback(async () => {
    if (selectedCourseIds.length === 0) return;

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
      const selectedCourses = courses
        .filter((c) => selectedCourseIds.includes(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          course_code: c.course_code,
          term: c.term ?? null,
        }));

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

      startPolling();
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
      startPolling();
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
    handleImport,
    handleSync,
    handleCancel,
    startPolling,
    stopPolling,
  };
}
