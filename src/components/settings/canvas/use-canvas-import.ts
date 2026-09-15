import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useCanvasImportOwner } from "@/components/canvas/canvas-import-notifications";
import { LS_ACTIVE_JOB, LS_ERRORS, LS_FORBIDDEN, LS_SYNCED } from "./canvas-helpers";
import { toFriendlyCanvasError } from "@/lib/friendly-errors";

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
  const owner = useCanvasImportOwner();
  const [isStartingSync, setIsStartingSync] = useState(false);
  const handledTerminalJobIdsRef = useRef(new Set<string>());
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

  useEffect(() => {
    const snapshot = owner.statusSnapshot;
    if (!snapshot) return;

    const nextForbidden = { ...latestStateRef.current.forbiddenCourses };
    let forbiddenChanged = false;
    for (const log of snapshot.recentLogs ?? []) {
      if (log.status !== "forbidden" || log.courseId == null) continue;
      const courseId = String(log.courseId);
      if (nextForbidden[courseId]) continue;
      nextForbidden[courseId] = true;
      forbiddenChanged = true;
    }
    if (forbiddenChanged) {
      latestStateRef.current.forbiddenCourses = nextForbidden;
      setForbiddenCourses(nextForbidden);
      localStorage.setItem(LS_FORBIDDEN, JSON.stringify(nextForbidden));
    }

    const latestJob = snapshot.latestJob;
    if (!latestJob?.jobId || snapshot.activeJob) return;
    if (handledTerminalJobIdsRef.current.has(latestJob.jobId)) return;
    handledTerminalJobIdsRef.current.add(latestJob.jobId);

    if (latestJob.status === "complete" && snapshot.progress) {
      const nextSynced = { ...latestStateRef.current.syncedCourses };
      for (const course of latestStateRef.current.courses) {
        if (
          course.canvasStatus !== "inaccessible" &&
          course.canvasStatus !== "unavailable" &&
          latestStateRef.current.selectedCourseIds.includes(String(course.id))
        ) {
          nextSynced[String(course.id)] = true;
        }
      }
      latestStateRef.current.syncedCourses = nextSynced;
      setSyncedCourses(nextSynced);
      localStorage.setItem(LS_SYNCED, JSON.stringify(nextSynced));
    } else if (latestJob.status === "failed") {
      setConnectionError(latestJob.errorMessage ?? t("Import failed"));
    } else if (latestJob.status === "cancelled") {
      setConnectionError(t("Import cancelled."));
    }
  }, [
    owner.statusSnapshot,
    setConnectionError,
    setForbiddenCourses,
    setSyncedCourses,
    t,
  ]);

  const handleImport = useCallback(async () => {
    if (selectedCourseIds.length === 0) return;

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

    try {
      const res = await fetch("/api/canvas/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: selectedCourses }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        courseId?: string;
        error?: string;
      };

      if (!res.ok || typeof data.jobId !== "string") {
        if (res.status === 401) {
          setConnectionError(t("Your session has expired. Please log in again."));
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
        setConnectionError(toFriendlyCanvasError(data.error ?? "import failed"));
        return;
      }

      localStorage.setItem(
        LS_ACTIVE_JOB,
        JSON.stringify({
          jobId: data.jobId,
          startedAt: new Date().toISOString(),
        }),
      );
      owner.trackJob(data.jobId, "import");
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
    }
  }, [
    courseErrors,
    courses,
    owner,
    selectedCourseIds,
    setConnectionError,
    setCourseErrors,
    t,
  ]);

  const handleSync = useCallback(async () => {
    setIsStartingSync(true);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST" });
      const data = (await res.json()) as {
        queued?: boolean;
        jobId?: string;
        error?: string;
        reason?: string;
      };
      if (res.status === 401) {
        setConnectionError(t("Your session has expired. Please log in again."));
        return;
      }
      if (!res.ok || !data.queued || typeof data.jobId !== "string") {
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
      owner.trackJob(data.jobId, "sync");
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
    } finally {
      setIsStartingSync(false);
    }
  }, [owner, setConnectionError, t]);

  const handleCancel = useCallback(async () => {
    try {
      const res = await fetch("/api/canvas/import", { method: "DELETE" });
      const data = (await res.json()) as { cancelled?: boolean };
      if (res.ok && data.cancelled) {
        await owner.checkStatus();
      }
    } catch {
      // The shared owner keeps polling and will observe a successful cancel.
    }
  }, [owner]);

  return {
    isImporting: owner.isImporting,
    isDiscovering: owner.isDiscovering,
    importSummary: owner.importSummary,
    progress: owner.progress,
    recentLogs: owner.recentLogs,
    isSyncing:
      isStartingSync ||
      (owner.isImporting && owner.progress?.jobType === "sync"),
    markerColdStarting: owner.markerColdStarting,
    estimatedSecsRemaining: owner.estimatedSecsRemaining,
    handleImport,
    handleSync,
    handleCancel,
    resetStatus: owner.resetStatus,
  };
}
