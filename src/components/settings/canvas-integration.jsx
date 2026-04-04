"use client";

import { useState, useEffect, useRef } from "react";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  LS_SELECTED,
  LS_ERRORS,
  LS_ACTIVE_JOB,
  LS_FORBIDDEN,
  LS_SYNCED,
  CheckCircleIcon,
  ChevronDownIcon,
  CourseBadge,
} from "./canvas/canvas-helpers";
import CanvasConnectionForm from "./canvas/canvas-connection-form";
import CanvasProgressPanel from "./canvas/canvas-progress-panel";
import { toFriendlyCanvasError } from "@/lib/friendly-errors";

/**
 * CanvasIntegration
 *
 * Handles the full Canvas LMS connection flow on the settings page.
 * Progress is persisted in localStorage so navigating away and back
 * doesn't lose the ongoing import state.
 */
export default function CanvasIntegration() {
  const { t } = useI18n();

  // Connection form state
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Post-connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDomain, setConnectedDomain] = useState("");
  const [courses, setCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [courseErrors, setCourseErrors] = useState({});

  // Startup check
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [connectionWarning, setConnectionWarning] = useState(null);
  const [syncAvailable, setSyncAvailable] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [markerColdStarting, setMarkerColdStarting] = useState(false);
  const pollRef = useRef(null);

  // Per-course status tracking (persisted in localStorage)
  const [forbiddenCourses, setForbiddenCourses] = useState({}); // { [courseId]: true }
  const [syncedCourses, setSyncedCourses] = useState({}); // { [courseId]: true }

  // UI state
  const [courseListOpen, setCourseListOpen] = useState(true);

  // ── On mount: restore state + check connection ────────────────────────────
  useEffect(() => {
    const savedErrors = JSON.parse(localStorage.getItem(LS_ERRORS) ?? "{}");
    const savedSynced = JSON.parse(localStorage.getItem(LS_SYNCED) ?? "{}");
    setCourseErrors(savedErrors);
    setSyncedCourses(savedSynced);

    const checkConnection = async () => {
      try {
        const res = await fetch("/api/canvas/connect");
        const data = await res.json();

        if (res.status === 401) {
          setConnectionWarning(
            t("Your session has expired. Please log in again."),
          );
        } else if (res.ok && data.connected) {
          setIsConnected(true);
          setConnectedDomain(data.domain);
          setCourses(data.courses ?? []);

          // use server-side forbidden courses as source of truth
          if (data.forbiddenCourseIds?.length > 0) {
            const serverForbidden = {};
            for (const id of data.forbiddenCourseIds)
              serverForbidden[String(id)] = true;
            setForbiddenCourses(serverForbidden);
            localStorage.setItem(LS_FORBIDDEN, JSON.stringify(serverForbidden));
          } else {
            // clear stale localStorage forbidden data
            const cached = JSON.parse(
              localStorage.getItem(LS_FORBIDDEN) ?? "{}",
            );
            setForbiddenCourses(cached);
          }

          const savedIds = JSON.parse(
            localStorage.getItem(LS_SELECTED) ?? "[]",
          );
          const validIds = (data.courses ?? []).map((c) => c.id);
          setSelectedCourseIds(savedIds.filter((id) => validIds.includes(id)));

          fetch("/api/canvas/sync")
            .then((r) => r.json())
            .then((d) => {
              setSyncAvailable(d.available ?? false);
            })
            .catch(() => {});

          // resume any in-flight import that was started before page reload
          const savedJob = JSON.parse(
            localStorage.getItem(LS_ACTIVE_JOB) ?? "null",
          );
          if (savedJob?.jobId) {
            // ping status — if job is still active, resume polling
            const statusRes = await fetch("/api/canvas/status");
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.activeJob) {
                setIsImporting(true);
                setProgress(statusData.progress);
                setRecentLogs(statusData.recentLogs ?? []);
                setMarkerColdStarting(Boolean(statusData.markerColdStarting));
                startPolling();
              } else {
                setMarkerColdStarting(false);
                // job already finished while away
                localStorage.removeItem(LS_ACTIVE_JOB);
                if (statusData.progress) {
                  setImportSummary({
                    imported: statusData.progress.completed,
                    forbidden: statusData.issues?.forbidden ?? 0,
                    failed: statusData.issues?.error ?? 0,
                    skipped: 0,
                  });
                  setProgress(statusData.progress);
                  const logs = statusData.recentLogs ?? [];
                  setRecentLogs(logs);
                  // backfill forbidden from returned logs
                  const newForbidden = { ...savedSynced };
                  for (const log of logs) {
                    if (log.status === "forbidden" && log.courseId)
                      newForbidden[String(log.courseId)] = true;
                  }
                  setForbiddenCourses(newForbidden);
                  localStorage.setItem(
                    LS_FORBIDDEN,
                    JSON.stringify(newForbidden),
                  );
                }
              }
            }
          }
        } else if (res.ok && !data.connected) {
          setConnectionWarning(
            t("Your Canvas token is invalid or expired. Please reconnect."),
          );
        }
      } catch {
        // network error — show the form
      } finally {
        setIsCheckingConnection(false);
      }
    };

    checkConnection();
    // one-time connection check on mount; startPolling and t are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist selected courses whenever they change ────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_SELECTED, JSON.stringify(selectedCourseIds));
  }, [selectedCourseIds]);

  const handleConnect = async () => {
    if (!domain || !token) return;

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const res = await fetch("/api/canvas/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setConnectionError(toFriendlyCanvasError(data.error));
        return;
      }

      setIsConnected(true);
      setConnectedDomain(domain);
      setCourses(data.courses ?? []);

      const savedIds = JSON.parse(localStorage.getItem(LS_SELECTED) ?? "[]");
      const validIds = (data.courses ?? []).map((c) => c.id);
      setSelectedCourseIds(savedIds.filter((id) => validIds.includes(id)));
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/canvas/connect", { method: "DELETE" });
    } finally {
      stopPolling();
      setIsConnected(false);
      setConnectedDomain("");
      setCourses([]);
      setSelectedCourseIds([]);
      setImportSummary(null);
      setProgress(null);
      setRecentLogs([]);
      setMarkerColdStarting(false);
      setDomain("");
      setToken("");
      localStorage.removeItem(LS_SELECTED);
      localStorage.removeItem(LS_ERRORS);
      localStorage.removeItem(LS_ACTIVE_JOB);
      localStorage.removeItem(LS_FORBIDDEN);
      localStorage.removeItem(LS_SYNCED);
      setCourseErrors({});
      setForbiddenCourses({});
      setSyncedCourses({});
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setImportSummary(null);
    setRecentLogs([]);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST" });
      const data = await res.json();
      if (res.status === 401) {
        setConnectionError(t("Your session has expired. Please log in again."));
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
  };

  const toggleCourse = (courseId) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const allSelected =
    courses.length > 0 && selectedCourseIds.length === courses.length;
  const _someSelected = selectedCourseIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCourseIds([]);
    } else {
      setSelectedCourseIds(courses.map((c) => c.id));
    }
  };

  const getCourseStatus = (courseId) => {
    if ((isImporting || isSyncing) && selectedCourseIds.includes(courseId)) {
      return { status: "syncing", error: null };
    }
    // forbidden badge is permanent — shown even when not importing
    if (forbiddenCourses[courseId]) {
      return { status: "forbidden", error: null };
    }
    if (courseErrors[courseId]) {
      return { status: "error", error: courseErrors[courseId] };
    }
    if (syncedCourses[courseId]) {
      return { status: syncAvailable ? "outOfSync" : "synced", error: null };
    }
    return { status: "idle", error: null };
  };

  /** Poll /api/canvas/status every 2 s while a job is active. */
  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/canvas/status");
        const data = await res.json();
        if (!res.ok) return;

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
          }
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const handleCancel = async () => {
    try {
      const res = await fetch("/api/canvas/import", { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.cancelled) {
        stopPolling();
        setIsImporting(false);
        setMarkerColdStarting(false);
        localStorage.removeItem(LS_ACTIVE_JOB);
        setImportSummary(null);
      }
    } catch {
      // polling will eventually detect the cancelled state
    }
  };

  const handleImport = async () => {
    if (selectedCourseIds.length === 0) return;

    setIsImporting(true);
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
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (isCheckingConnection) {
    return (
      <div className="text-sm text-text-tertiary animate-pulse">
        {t("Checking Canvas connection...")}
      </div>
    );
  }

  const showProgress = (isImporting || importSummary) && progress;

  return (
    <div className="grid grid-cols-1 gap-y-8 sm:max-w-xl">
      {/* ── Connection status badge ────────────────────────────────── */}
      {isConnected && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircleIcon className="size-4 shrink-0" />
          <span>
            {t("Connected to")}{" "}
            <span className="font-medium">{connectedDomain}</span>
          </span>
        </div>
      )}

      {/* connection form (when not connected) */}
      {!isConnected && (
        <CanvasConnectionForm
          domain={domain}
          setDomain={setDomain}
          token={token}
          setToken={setToken}
          isConnecting={isConnecting}
          connectionError={connectionError}
          connectionWarning={connectionWarning}
          onConnect={handleConnect}
        />
      )}

      {/* ── Connected state — course selection ─────────────────────── */}
      {isConnected && (
        <>
          {/* Collapsible course list */}
          <div className="glass-card rounded-radius-md">
            <button
              type="button"
              onClick={() => setCourseListOpen(!courseListOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text-secondary">
                  {t("Courses")}
                </h3>
                {selectedCourseIds.length > 0 && (
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
                    {selectedCourseIds.length} {t("selected")}
                  </span>
                )}
              </div>
              <ChevronDownIcon
                className="size-4 text-text-tertiary"
                open={courseListOpen}
              />
            </button>

            {courseListOpen && (
              <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-white/2.5">
                {courses.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs text-primary-400 hover:text-primary-300 font-medium"
                    >
                      {allSelected ? t("Deselect all") : t("Select all")}
                    </button>
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {courses.map((course) => {
                    const { status, error } = getCourseStatus(course.id);
                    return (
                      <label
                        key={course.id}
                        className="flex items-start gap-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(course.id)}
                          onChange={() => toggleCourse(course.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-text-secondary">
                              {course.name}
                            </p>
                            <CourseBadge status={status} errorMsg={error} />
                          </div>
                          <p className="text-xs text-text-tertiary">
                            {course.course_code}
                          </p>
                          {course.modules?.length > 0 && (
                            <p className="text-xs text-text-tertiary">
                              {course.modules.length}{" "}
                              {course.modules.length !== 1
                                ? t("modules")
                                : t("module")}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Import error */}
          {connectionError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <ExclamationCircleIcon className="size-4 shrink-0" />
              {connectionError}
            </div>
          )}

          {/* progress panel */}
          {showProgress && (
            <CanvasProgressPanel
              isImporting={isImporting}
              isSyncing={isSyncing}
              progress={progress}
              importSummary={importSummary}
              recentLogs={recentLogs}
              markerColdStarting={markerColdStarting}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {isImporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
              >
                {t("Cancel import")}
              </button>
            ) : (
              <button
                type="button"
                disabled={selectedCourseIds.length === 0 || isSyncing}
                onClick={handleImport}
                className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {`${t("Import selected courses")}${selectedCourseIds.length > 0 ? ` (${selectedCourseIds.length})` : ""}`}
              </button>
            )}
            <button
              type="button"
              disabled={isImporting || isSyncing || !syncAvailable}
              onClick={handleSync}
              className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title={t("Check for new files in previously imported courses")}
            >
              {isSyncing ? t("Checking...") : t("Check for updates")}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
            >
              {t("Disconnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
