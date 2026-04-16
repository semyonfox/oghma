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
} from "./canvas/canvas-helpers";
import CanvasConnectionForm from "./canvas/canvas-connection-form";
import CanvasProgressPanel from "./canvas/canvas-progress-panel";
import CanvasCourseSelector from "./canvas/canvas-course-selector";
import useCanvasImport from "./canvas/use-canvas-import";
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const tokenInputRef = useRef(null);

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

  // Per-course status tracking (persisted in localStorage)
  const [forbiddenCourses, setForbiddenCourses] = useState({}); // { [courseId]: true }
  const [syncedCourses, setSyncedCourses] = useState({}); // { [courseId]: true }

  // UI state
  const [courseListOpen, setCourseListOpen] = useState(true);

  // import/polling state (custom hook)
  const {
    isImporting,
    setIsImporting,
    isDiscovering,
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
  } = useCanvasImport({
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
  });

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
    const rawToken = tokenInputRef.current?.value?.trim() ?? "";
    if (!domain || !rawToken) return;

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const token = rawToken;
      if (tokenInputRef.current) {
        tokenInputRef.current.value = "";
      }

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
      if (tokenInputRef.current) {
        tokenInputRef.current.value = "";
      }
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

  const toggleCourse = (courseId) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const toggleSelectAll = () => {
    const allSelected =
      courses.length > 0 && selectedCourseIds.length === courses.length;
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
          tokenInputRef={tokenInputRef}
          isConnecting={isConnecting}
          connectionError={connectionError}
          connectionWarning={connectionWarning}
          onConnect={handleConnect}
        />
      )}

      {/* ── Connected state — course selection ─────────────────────── */}
      {isConnected && (
        <>
          <CanvasCourseSelector
            courses={courses}
            selectedCourseIds={selectedCourseIds}
            onToggleCourse={toggleCourse}
            onToggleSelectAll={toggleSelectAll}
            getCourseStatus={getCourseStatus}
            courseListOpen={courseListOpen}
            setCourseListOpen={setCourseListOpen}
            t={t}
          />

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
              isDiscovering={isDiscovering}
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
