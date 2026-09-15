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
import useNoteTreeStore from "@/lib/notes/state/tree";

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

interface TrashFolder {
  rootId: string;
  title: string;
  deletedAt: string;
}

interface PendingTrash {
  url: string;
  body?: Record<string, unknown>;
  folders: TrashFolder[];
}

interface PendingReplacement {
  url: string;
  body?: Record<string, unknown>;
  jobId: string;
  status: string;
}

interface ActionFence {
  controller: AbortController;
  treeGeneration: number;
}

function getStoredActiveJobId(): string | null {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(LS_ACTIVE_JOB) ?? "null",
    );
    if (
      stored &&
      typeof stored === "object" &&
      "jobId" in stored &&
      typeof stored.jobId === "string"
    ) {
      return stored.jobId;
    }
  } catch {
    localStorage.removeItem(LS_ACTIVE_JOB);
  }
  return null;
}

function jobIdFrom(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("jobId" in value)) return null;
  return typeof value.jobId === "string" ? value.jobId : null;
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
  const [pendingReplacement, setPendingReplacement] =
    useState<PendingReplacement | null>(null);
  const [pendingTrash, setPendingTrash] = useState<PendingTrash | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const mountedRef = useRef(false);
  const actionControllersRef = useRef(new Set<AbortController>());
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
    mountedRef.current = true;
    const actionControllers = actionControllersRef.current;
    return () => {
      mountedRef.current = false;
      actionControllers.clear();
    };
  }, []);

  const beginAction = useCallback((): ActionFence => {
    const controller = new AbortController();
    actionControllersRef.current.add(controller);
    return {
      controller,
      treeGeneration: useNoteTreeStore.getState().generation,
    };
  }, []);

  const actionIsCurrent = useCallback((action: ActionFence): boolean => {
    return (
      mountedRef.current &&
      !action.controller.signal.aborted &&
      useNoteTreeStore.getState().generation === action.treeGeneration
    );
  }, []);

  const requireCurrentAction = useCallback(
    (action: ActionFence): void => {
      if (!actionIsCurrent(action)) {
        throw new DOMException("Canvas action is stale", "AbortError");
      }
    },
    [actionIsCurrent],
  );

  const finishAction = useCallback((action: ActionFence): void => {
    actionControllersRef.current.delete(action.controller);
  }, []);

  const recoverAfterNavigation = useCallback(
    (action: ActionFence): void => {
      if (useNoteTreeStore.getState().generation === action.treeGeneration) {
        void owner.checkStatus();
      }
    },
    [owner],
  );

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
      setConnectionError(t("Import stopped"));
    }
  }, [
    owner.statusSnapshot,
    setConnectionError,
    setForbiddenCourses,
    setSyncedCourses,
    t,
  ]);

  const beginJob = useCallback(
    (jobId: string, jobType: string, action: ActionFence) => {
      requireCurrentAction(action);
      localStorage.setItem(
        LS_ACTIVE_JOB,
        JSON.stringify({ jobId, startedAt: new Date().toISOString() }),
      );
      owner.trackJob(jobId, jobType);
    },
    [owner, requireCurrentAction],
  );

  const requestStart = useCallback(
    async (
      action: ActionFence,
      url: string,
      body?: Record<string, unknown>,
      expectedJobId?: string,
    ) => {
      const target =
        expectedJobId && url === "/api/canvas/sync"
          ? `${url}?expectedActiveJobId=${encodeURIComponent(expectedJobId)}`
          : url;
      const payload =
        expectedJobId && url !== "/api/canvas/sync"
          ? { ...body, expectedActiveJobId: expectedJobId }
          : body;
      const response = await fetch(target, {
        method: "POST",
        signal: action.controller.signal,
        ...(payload
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          : {}),
      });
      requireCurrentAction(action);

      if (response.status !== 409) return response;
      const conflict: unknown = await response.clone().json();
      requireCurrentAction(action);
      if (
        conflict &&
        typeof conflict === "object" &&
        "code" in conflict &&
        conflict.code === "canvas_folders_in_trash" &&
        "folders" in conflict &&
        Array.isArray(conflict.folders)
      ) {
        const folders = conflict.folders.filter(
          (folder): folder is TrashFolder =>
            Boolean(
              folder &&
                typeof folder === "object" &&
                "rootId" in folder &&
                typeof folder.rootId === "string" &&
                "title" in folder &&
                typeof folder.title === "string" &&
                "deletedAt" in folder &&
                typeof folder.deletedAt === "string",
            ),
        );
        if (folders.length === 0 || folders.length !== conflict.folders.length) {
          throw new Error("Invalid Trash response");
        }
        setPendingTrash({ url: target, body: payload, folders });
        setPendingReplacement(null);
      } else if (
        conflict &&
        typeof conflict === "object" &&
        "activeJob" in conflict
      ) {
        const active = conflict.activeJob;
        if (
          active &&
          typeof active === "object" &&
          "jobId" in active &&
          typeof active.jobId === "string" &&
          "status" in active &&
          typeof active.status === "string"
        ) {
          setPendingReplacement({
            url,
            body,
            jobId: active.jobId,
            status: active.status,
          });
          owner.trackJob(
            active.jobId,
            url === "/api/canvas/sync" ? "sync" : "import",
          );
        } else {
          setPendingReplacement(null);
          setConnectionError(t("The active import changed. Please try again."));
        }
      }
      return response;
    },
    [owner, requireCurrentAction, setConnectionError, t],
  );

  const handleTrashChoice = useCallback(
    async (restore: boolean) => {
      if (!pendingTrash || isRestoring) return;
      const action = beginAction();
      setIsRestoring(true);
      try {
        if (restore) {
          for (const folder of pendingTrash.folders) {
            const response = await fetch("/api/trash", {
              method: "POST",
              signal: action.controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "restore",
                id: folder.rootId,
                expectedDeletedAt: folder.deletedAt,
              }),
            });
            requireCurrentAction(action);
            if (response.status === 404 || response.status === 409) break;
            if (!response.ok) throw new Error("Restore failed");
            setPendingTrash((current) =>
              current
                ? {
                    ...current,
                    folders: current.folders.filter(
                      (item) => item.rootId !== folder.rootId,
                    ),
                  }
                : null,
            );
            await useNoteTreeStore
              .getState()
              .refreshTreePaths([[folder.rootId]]);
            requireCurrentAction(action);
          }
        }

        const response = await requestStart(
          action,
          pendingTrash.url,
          {
            ...pendingTrash.body,
            keepTrashedFolders: !restore,
          },
        );
        if (response.status === 409) {
          const conflict: unknown = await response.clone().json();
          if (
            !conflict ||
            typeof conflict !== "object" ||
            !("code" in conflict) ||
            conflict.code !== "canvas_folders_in_trash"
          ) {
            setPendingTrash(null);
          }
          return;
        }
        const result: unknown = await response.json();
        requireCurrentAction(action);
        const jobId = jobIdFrom(result);
        if (!response.ok || !jobId) throw new Error("Import failed");
        setPendingTrash(null);
        setConnectionError(null);
        beginJob(jobId, "import", action);
      } catch {
        if (actionIsCurrent(action)) {
          setConnectionError(
            t("Could not restore the folders and start the import. Please try again."),
          );
        } else {
          recoverAfterNavigation(action);
        }
      } finally {
        if (actionIsCurrent(action)) setIsRestoring(false);
        finishAction(action);
      }
    },
    [
      beginJob,
      beginAction,
      actionIsCurrent,
      finishAction,
      isRestoring,
      pendingTrash,
      requestStart,
      requireCurrentAction,
      recoverAfterNavigation,
      setConnectionError,
      t,
    ],
  );

  const confirmReplacement = useCallback(async () => {
    if (!pendingReplacement || isReplacing) return;
    const action = beginAction();
    setIsReplacing(true);
    try {
      const response = await requestStart(
        action,
        pendingReplacement.url,
        pendingReplacement.body,
        pendingReplacement.jobId,
      );
      const result: unknown = await response.json();
      requireCurrentAction(action);
      const jobId = jobIdFrom(result);
      if (response.ok && jobId) {
        setPendingReplacement(null);
        setConnectionError(null);
        beginJob(
          jobId,
          pendingReplacement.url === "/api/canvas/sync" ? "sync" : "import",
          action,
        );
      } else if (response.status !== 409) {
        setConnectionError(t("Could not start the import. Please try again."));
      }
    } catch {
      if (actionIsCurrent(action)) {
        setConnectionError(toFriendlyCanvasError("network"));
      } else {
        recoverAfterNavigation(action);
      }
    } finally {
      if (actionIsCurrent(action)) setIsReplacing(false);
      finishAction(action);
    }
  }, [
    actionIsCurrent,
    beginJob,
    beginAction,
    finishAction,
    isReplacing,
    pendingReplacement,
    requestStart,
    requireCurrentAction,
    recoverAfterNavigation,
    setConnectionError,
    t,
  ]);

  const handleRetry = useCallback(async () => {
    if (!owner.retrySourceJobId) return;
    const action = beginAction();
    try {
      const response = await requestStart(
        action,
        "/api/canvas/retry",
        { sourceJobId: owner.retrySourceJobId },
      );
      const result: unknown = await response.json();
      requireCurrentAction(action);
      const jobId = jobIdFrom(result);
      if (response.ok && jobId) {
        beginJob(jobId, "retry", action);
      } else if (response.status !== 409) {
        setConnectionError(t("Could not start the import. Please try again."));
      }
    } catch {
      if (actionIsCurrent(action)) {
        setConnectionError(toFriendlyCanvasError("network"));
      } else {
        recoverAfterNavigation(action);
      }
    } finally {
      finishAction(action);
    }
  }, [
    actionIsCurrent,
    beginAction,
    beginJob,
    finishAction,
    owner.retrySourceJobId,
    recoverAfterNavigation,
    requestStart,
    requireCurrentAction,
    setConnectionError,
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

    const action = beginAction();
    try {
      const response = await requestStart(
        action,
        "/api/canvas/import",
        { courseIds: selectedCourses },
      );
      if (response.status === 409) return;
      const data = (await response.json()) as {
        jobId?: string;
        courseId?: string;
        error?: string;
      };
      requireCurrentAction(action);
      if (!response.ok || typeof data.jobId !== "string") {
        if (response.status === 401) {
          setConnectionError(t("Your session has expired. Please log in again."));
          return;
        }
        if (response.status === 403 && data.courseId) {
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
      beginJob(data.jobId, "import", action);
    } catch {
      if (actionIsCurrent(action)) {
        setConnectionError(toFriendlyCanvasError("network"));
      } else {
        recoverAfterNavigation(action);
      }
    } finally {
      finishAction(action);
    }
  }, [
    actionIsCurrent,
    beginAction,
    beginJob,
    courseErrors,
    courses,
    finishAction,
    recoverAfterNavigation,
    requestStart,
    requireCurrentAction,
    selectedCourseIds,
    setConnectionError,
    setCourseErrors,
    t,
  ]);

  const handleSync = useCallback(async () => {
    const action = beginAction();
    setIsStartingSync(true);
    try {
      const response = await requestStart(
        action,
        "/api/canvas/sync",
      );
      if (response.status === 409) return;
      const data = (await response.json()) as {
        queued?: boolean;
        jobId?: string;
        error?: string;
        reason?: string;
      };
      requireCurrentAction(action);
      if (response.status === 401) {
        setConnectionError(t("Your session has expired. Please log in again."));
        return;
      }
      if (!response.ok || !data.queued || typeof data.jobId !== "string") {
        setConnectionError(
          toFriendlyCanvasError(data.error ?? data.reason ?? "sync failed"),
        );
        return;
      }
      beginJob(data.jobId, "sync", action);
    } catch {
      if (actionIsCurrent(action)) {
        setConnectionError(toFriendlyCanvasError("network"));
      } else {
        recoverAfterNavigation(action);
      }
    } finally {
      if (actionIsCurrent(action)) setIsStartingSync(false);
      finishAction(action);
    }
  }, [
    actionIsCurrent,
    beginAction,
    beginJob,
    finishAction,
    recoverAfterNavigation,
    requestStart,
    requireCurrentAction,
    setConnectionError,
    t,
  ]);

  const handleCancel = useCallback(async () => {
    const jobId =
      owner.statusSnapshot?.activeJob?.jobId ?? getStoredActiveJobId();
    if (!jobId) return;
    const action = beginAction();
    try {
      const response = await fetch(
        `/api/canvas/import?jobId=${encodeURIComponent(jobId)}`,
        { method: "DELETE", signal: action.controller.signal },
      );
      requireCurrentAction(action);
      if (response.status === 409) {
        setConnectionError(t("The active import changed. Please try again."));
      } else if (response.ok) {
        await owner.checkStatus();
      }
    } catch {
      if (actionIsCurrent(action)) {
        setConnectionError(toFriendlyCanvasError("network"));
      } else {
        recoverAfterNavigation(action);
      }
    } finally {
      finishAction(action);
    }
  }, [
    actionIsCurrent,
    beginAction,
    finishAction,
    owner,
    recoverAfterNavigation,
    requireCurrentAction,
    setConnectionError,
    t,
  ]);

  return {
    pendingReplacement,
    setPendingReplacement,
    confirmReplacement,
    isReplacing,
    pendingTrash,
    setPendingTrash,
    handleTrashChoice,
    isRestoring,
    discovery: owner.discovery,
    terminalStatus: owner.terminalStatus,
    retrySourceJobId: owner.retrySourceJobId,
    handleRetry,
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
