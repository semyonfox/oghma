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
import {
  getMarketingContext,
  trackMarketingEvent,
} from "@/lib/marketing/client";

type Course = {
  id: string;
  name: string;
  course_code: string;
  term?: string | { id?: string; name?: string } | null;
  historical?: boolean;
  modules?: unknown[];
  canvasStatus?: string;
  canvasStatusReason?: string;
};

/**
 * CanvasIntegrationSettings
 *
 * Handles the full Canvas LMS connection flow on the settings page.
 * Progress is persisted in localStorage so navigating away and back
 * does not lose the active import state.
 */
export default function CanvasIntegrationSettings() {
  const { t } = useI18n();

  // Connection form state
  const [domain, setDomain] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Post-connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDomain, setConnectedDomain] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [courseErrors, setCourseErrors] = useState<Record<string, string>>({});

  // Startup check
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [courseDiscoveryDegraded, setCourseDiscoveryDegraded] = useState(false);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);

  // Per-course status tracking (persisted in localStorage)
  const [forbiddenCourses, setForbiddenCourses] = useState<Record<string, boolean>>({}); // { [courseId]: true }
  const [syncedCourses, setSyncedCourses] = useState<Record<string, boolean>>({}); // { [courseId]: true }

  // UI state
  const [courseListOpen, setCourseListOpen] = useState(true);
  const [isDownloadingCanvasFiles, setIsDownloadingCanvasFiles] =
    useState(false);

  const isCourseImportable = (course: Course) =>
    course.canvasStatus !== "inaccessible" &&
    course.canvasStatus !== "unavailable";

  // import/polling state (custom hook)
  const {
    isImporting,
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
    estimatedSecsRemaining,
    setEstimatedSecsRemaining,
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
        const data = await res.json() as {
          connected?: boolean;
          domain?: string;
          courses?: Course[];
          forbiddenCourseIds?: Array<string | number>;
          courseDiscoveryDegraded?: boolean;
        };

        if (res.status === 401) {
          setConnectionWarning(
            t("Your session has expired. Please log in again."),
          );
        } else if (res.ok && data.connected) {
          setIsConnected(true);
          setConnectedDomain(data.domain ?? "");
          setCourses(data.courses ?? []);
          setCourseDiscoveryDegraded(Boolean(data.courseDiscoveryDegraded));

          // use server-side forbidden courses as source of truth
          const serverForbidden: Record<string, boolean> = {};
          if (Array.isArray(data.forbiddenCourseIds)) {
            for (const id of data.forbiddenCourseIds)
              serverForbidden[String(id)] = true;
            setForbiddenCourses(serverForbidden);
            localStorage.setItem(LS_FORBIDDEN, JSON.stringify(serverForbidden));
          } else {
            // Older servers did not expose this contract. Do not reuse stale
            // client state as if it were a server-confirmed restriction.
            setForbiddenCourses({});
            localStorage.removeItem(LS_FORBIDDEN);
          }

          const savedSelection = localStorage.getItem(LS_SELECTED);
          const savedIds = JSON.parse(savedSelection ?? "[]");
          const validIds = (data.courses ?? [])
            .filter(isCourseImportable)
            .map((c) => String(c.id));
          const historicalIds = (data.courses ?? [])
            .filter((course) => course.historical && isCourseImportable(course))
            .map((course) => String(course.id));
          setSelectedCourseIds(
            Array.from(
              new Set(
                (savedSelection === null
                  ? validIds
                  : savedIds.map(String).filter((id: string) => validIds.includes(id))
                ).concat(historicalIds),
              ),
            ),
          );

          fetch("/api/canvas/sync")
            .then((r) => r.json())
            .then((d: { available?: boolean }) => {
              setSyncAvailable(d.available ?? false);
            })
            .catch(() => {})
            .finally(() => setSyncChecked(true));

          // resume any in-flight import that was started before page reload
          const savedJob = JSON.parse(
            localStorage.getItem(LS_ACTIVE_JOB) ?? "null",
          );
          if (savedJob?.jobId) {
            startPolling(savedJob.jobId);
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
    trackMarketingEvent("canvas_connect_attempt", {
      source: "settings_canvas",
      properties: {
        location: "settings",
      },
    });

    try {
      const token = rawToken;
      if (tokenInputRef.current) {
        tokenInputRef.current.value = "";
      }

      const res = await fetch("/api/canvas/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, token, marketing: getMarketingContext() }),
      });

      const data = await res.json() as {
        courses?: Course[];
        error?: string;
        courseDiscoveryDegraded?: boolean;
      };

      if (!res.ok) {
        trackMarketingEvent("canvas_connect_error", {
          source: "settings_canvas",
          properties: {
            location: "settings",
            error_type: "api_error",
          },
        });
        setConnectionError(toFriendlyCanvasError(data.error));
        return;
      }

      // Successful connection is recorded once by the server as a canonical milestone.
      setIsConnected(true);
      setConnectedDomain(domain);
      setCourses(data.courses ?? []);
      setCourseDiscoveryDegraded(Boolean(data.courseDiscoveryDegraded));

      const savedSelection = localStorage.getItem(LS_SELECTED);
      const savedIds = JSON.parse(savedSelection ?? "[]");
      const validIds = (data.courses ?? [])
        .filter(isCourseImportable)
        .map((c) => String(c.id));
      const historicalIds = (data.courses ?? [])
        .filter((course) => course.historical && isCourseImportable(course))
        .map((course) => String(course.id));
      setSelectedCourseIds(
        Array.from(
          new Set(
            (savedSelection === null
              ? validIds
              : savedIds.map(String).filter((id: string) => validIds.includes(id))
            ).concat(historicalIds),
          ),
        ),
      );
    } catch {
      trackMarketingEvent("canvas_connect_error", {
        source: "settings_canvas",
        properties: {
          location: "settings",
          error_type: "network_error",
        },
      });
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
      setCourseDiscoveryDegraded(false);
      setSelectedCourseIds([]);
      setImportSummary(null);
      setProgress(null);
      setRecentLogs([]);
      setMarkerColdStarting(false);
      setEstimatedSecsRemaining(null);
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

  const handleDownloadCanvasFiles = async () => {
    setIsDownloadingCanvasFiles(true);
    setConnectionError(null);

    try {
      const selectedCourses =
        selectedCourseIds.length > 0
          ? courses
              .filter(
                (course) =>
                  isCourseImportable(course) &&
                  selectedCourseIds.includes(String(course.id)),
              )
              .map((c) => ({
                id: String(c.id),
                name: c.name,
                course_code: c.course_code,
                term: c.term ?? null,
              }))
          : null;

      if (selectedCourseIds.length > 0 && selectedCourses?.length === 0) {
        return;
      }

      const res = await fetch("/api/canvas/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedCourses ? { courseIds: selectedCourses } : {},
        ),
      });

      if (!res.ok) {
        let message = "download failed";
        try {
          const data = await res.json();
          message = data.error ?? message;
        } catch {}
        setConnectionError(toFriendlyCanvasError(message));
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "canvas-files.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setConnectionError(toFriendlyCanvasError("network"));
    } finally {
      setIsDownloadingCanvasFiles(false);
    }
  };

  const toggleCourse = (courseId: string | number) => {
    const id = String(courseId);
    const course = courses.find((item) => String(item.id) === id);
    if (!course || !isCourseImportable(course)) return;
    setSelectedCourseIds((prev) =>
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    const importableIds = courses
      .filter(isCourseImportable)
      .map((course) => String(course.id));
    const allSelected =
      importableIds.length > 0 &&
      importableIds.every((id) => selectedCourseIds.includes(id));
    if (allSelected) {
      setSelectedCourseIds([]);
    } else {
      setSelectedCourseIds(importableIds);
    }
  };

  const getCourseStatus = (courseId: string | number): { status: "syncing" | "forbidden" | "error" | "checking" | "outOfSync" | "synced" | "idle"; error?: string } => {
    const id = String(courseId);
    if ((isImporting || isSyncing) && selectedCourseIds.includes(id)) {
      return { status: "syncing" };
    }
    // forbidden badge is permanent — shown even when not importing
    if (forbiddenCourses[id]) {
      return { status: "forbidden" };
    }
    if (courseErrors[id]) {
      return { status: "error", error: courseErrors[id] };
    }
    if (syncedCourses[id]) {
      // while the forbidden list + sync availability are still loading, show a
      // neutral "checking" tag instead of prematurely flashing out-of-sync
      if (!syncChecked) {
        return { status: "checking" };
      }
      // a course with no modules/files has nothing to sync — never "out of sync"
      const course = courses.find((c) => String(c.id) === id);
      // Course previews deliberately omit eager module discovery for large
      // enrollment histories. In that case, keep the normal resync affordance.
      const hasContent =
        course?.modules === undefined || course.modules.length > 0;
      return {
        status: syncAvailable && hasContent ? "outOfSync" : "synced",
        error: undefined,
      };
    }
    return { status: "idle" };
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
  const selectedImportableCourseCount = courses.filter(
    (course) =>
      isCourseImportable(course) &&
      selectedCourseIds.includes(String(course.id)),
  ).length;

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

          {courseDiscoveryDegraded && (
            <p className="text-xs text-yellow-400">
              {t(
                "Canvas could not list every historical course. Showing the courses it currently exposes.",
              )}
            </p>
          )}

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
              estimatedSecsRemaining={estimatedSecsRemaining}
            />
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {isImporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-radius-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
              >
                {t("Cancel import")}
              </button>
            ) : (
              <button
                type="button"
                disabled={selectedImportableCourseCount === 0 || isSyncing}
                onClick={handleImport}
                className="rounded-radius-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {`${t("Import selected courses")}${selectedImportableCourseCount > 0 ? ` (${selectedImportableCourseCount})` : ""}`}
              </button>
            )}
            <button
              type="button"
              disabled={
                isImporting ||
                isSyncing ||
                isDownloadingCanvasFiles ||
                (selectedCourseIds.length > 0 &&
                  selectedImportableCourseCount === 0)
              }
              onClick={handleDownloadCanvasFiles}
              className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloadingCanvasFiles
                ? t("Preparing archive...")
                : `${t("Download full Canvas archive")}${
                    selectedImportableCourseCount > 0
                      ? ` (${selectedImportableCourseCount})`
                      : ` (${t("all courses")})`
                  }`}
            </button>
            <button
              type="button"
              disabled={
                isImporting ||
                isSyncing ||
                isDownloadingCanvasFiles ||
                !syncAvailable
              }
              onClick={handleSync}
              className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title={t("Check for new files in previously imported courses")}
            >
              {isSyncing ? t("Checking...") : t("Check for updates")}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="rounded-radius-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
            >
              {t("Disconnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
