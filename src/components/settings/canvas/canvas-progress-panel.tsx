"use client";

import { useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  ChevronDownIcon,
  LogStatusIcon,
  formatTime,
  relativeTime,
} from "./canvas-helpers";
import { toFriendlyCanvasLogMessage } from "@/lib/friendly-errors";

type Progress = { percent: number; completed: number; total: number };
type ImportSummary = { imported: number; forbidden: number; failed: number; skipped: number };
type Log = {
  status?: string;
  filename?: string;
  errorMessage?: string | null;
  updatedAt?: string;
};

export default function CanvasProgressPanel({
  isImporting,
  isDiscovering,
  isSyncing,
  progress,
  importSummary,
  recentLogs,
  markerColdStarting,
  estimatedSecsRemaining, discovery, terminalStatus,
}: {
  isImporting: boolean;
  isDiscovering: boolean;
  isSyncing: boolean;
  progress: Progress | null;
  importSummary: ImportSummary | null;
  recentLogs: Log[];
  markerColdStarting: boolean;
  estimatedSecsRemaining: number | null;
  terminalStatus?: string | null;
  discovery?: { completedCourses: number; totalCourses: number; stage: string; filesFound: number; skippedCourses?: string[]; skippedFolders?: string[] } | null;
}) {
  const { t } = useI18n();
  const [logsSuccessOpen, setLogsSuccessOpen] = useState(false);
  const [logsFailedOpen, setLogsFailedOpen] = useState(true);

  if (!progress) return null;

  const skippedFolders = [...(discovery?.skippedCourses ?? []), ...(discovery?.skippedFolders ?? [])];
  const isTerminalFailure =
    !isImporting &&
    Boolean(
      importSummary &&
        importSummary.imported === 0 &&
        importSummary.failed > 0,
    );
  const terminalBarColor = terminalStatus === "cancelled" ? "bg-text-tertiary" : importSummary?.failed
    ? "bg-red-500"
    : importSummary?.forbidden
      ? "bg-orange-500"
      : "bg-green-500";

  const LogRow = ({ log }: { log: Log }) => (
    <div
      className={`flex items-start gap-2 px-4 py-1 border-b border-border-subtle last:border-0 ${
        log.status === "forbidden"
          ? "bg-orange-500/5"
          : log.status === "error"
            ? "bg-red-500/5"
            : ""
      }`}
    >
      <LogStatusIcon status={log.status ?? "unknown"} t={t} />
      <span
        className="flex-1 min-w-0 truncate text-text-tertiary"
        title={log.filename ?? ""}
      >
        {log.filename}
      </span>
      {log.errorMessage && (
        <span
          className="text-red-400/80 shrink-0 max-w-[10rem] truncate"
          title={log.errorMessage}
        >
          {toFriendlyCanvasLogMessage(log.errorMessage)}
        </span>
      )}
      <span className="shrink-0 text-text-tertiary/50">
        {relativeTime(log.updatedAt ?? new Date(), t)}
      </span>
    </div>
  );

  const successLogs = recentLogs.filter((l) => l.status === "complete");
  const failedLogs = recentLogs.filter(
    (l) => l.status === "error" || l.status === "forbidden",
  );
  const activeLogs = recentLogs.filter(
    (l) =>
      l.status === "downloading" ||
      l.status === "processing" ||
      l.status === "indexing" ||
      l.status === "pending_marker" ||
      l.status === "pending_retry" || l.status === "pending_cache",
  );

  return (
    <div className="glass-card rounded-radius-md overflow-hidden">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          {isImporting && (
            <span aria-hidden="true" className="inline-block size-3.5 shrink-0 rounded-full border-2 border-primary-400/30 border-t-primary-400 motion-safe:animate-spin" />
          )}
          <span className="text-sm font-medium text-text-secondary">
            {isImporting
              ? isDiscovering
                ? t("Discovering files...")
                : `${isSyncing ? t("Checking for updates...") : t("Importing...")} (${progress.completed}/${progress.total || "?"})`
              : terminalStatus === "cancelled" ? t("Import stopped")
                : terminalStatus === "failed" || isTerminalFailure ? t("Import failed")
                : (skippedFolders.length || (importSummary && (importSummary.failed > 0 || importSummary.forbidden > 0)))
                  ? t("Completed with issues") : t("Import complete")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isImporting && !isDiscovering && estimatedSecsRemaining != null && (
            <span className="text-xs text-text-tertiary tabular-nums">
              {t("{time} left", {
                time: formatTime(estimatedSecsRemaining),
              })}
            </span>
          )}
          {importSummary && !isImporting && (
            <div className="flex items-center gap-2 text-xs tabular-nums">
              {importSummary.imported > 0 && (
                <span className="text-green-400">
                  {t("{count} imported", { count: importSummary.imported })}
                </span>
              )}
              {importSummary.forbidden > 0 && (
                <span className="text-orange-400">
                  {t("{count} restricted", {
                    count: importSummary.forbidden,
                  })}
                </span>
              )}
              {importSummary.failed > 0 && (
                <span className="text-red-400">
                  {t("{count} failed", { count: importSummary.failed })}
                </span>
              )}
            </div>
          )}
          <span className="text-sm tabular-nums font-semibold text-text-secondary">
            {!isDiscovering && `${progress.percent ?? 0}%`}
          </span>
        </div>
      </div>

      {Boolean(skippedFolders.length) && (
        <p className="px-4 py-3 text-xs text-orange-400" role="status">
          {t("Some Canvas folders were skipped because they are in Trash. Restore them to include them in a future import.")}
          {" "}{skippedFolders.join(", ")}
        </p>
      )}

      {isImporting && isDiscovering && discovery && (
        <div className="space-y-2 px-4 pb-4 text-sm text-text-secondary" role="status" aria-atomic="true">
          <p>
            {discovery.stage === "modules" ? t("Checking modules") : discovery.stage === "assignments"
              ? t("Checking assignments") : discovery.stage === "files" ? t("Checking files") : t("Discovering files...")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
            <span>{t("{completed} of {total} courses checked", { completed: discovery.completedCourses, total: discovery.totalCourses })}</span>
            <span>{t("{count} files found", { count: discovery.filesFound })}</span>
          </div>
        </div>
      )}
      {importSummary && importSummary.skipped > 0 && <p className="px-4 pb-3 text-xs text-text-secondary">
        {t("{count} stopped", { count: importSummary.skipped })}
      </p>}
      {/* File progress is only measurable after discovery. */}
      {!isDiscovering && (
        <div className="h-1.5 w-full bg-subtle overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${isImporting ? "bg-primary-500" : terminalBarColor}`}
            style={{ width: `${progress.percent ?? 0}%` }}
          />
        </div>
      )}

      {isImporting && markerColdStarting && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-t border-amber-500/20">
          {t(
            "Canvas import is warming up the document processor. The first files can take a few minutes.",
          )}
        </div>
      )}

      {/* log panels — hidden during discovery since no files are processing yet */}
      {recentLogs.length > 0 && !isDiscovering && (
        <div className="border-t border-border-subtle divide-y divide-border-subtle/50">
          {/* in-progress files */}
          {activeLogs.length > 0 && (
            <div className="font-mono text-xs bg-black/20">
              {activeLogs.map((log, i) => (
                <LogRow key={i} log={log} />
              ))}
            </div>
          )}

          {/* failed / restricted */}
          {failedLogs.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setLogsFailedOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-subtle transition-colors"
              >
                <span className="text-xs font-medium text-red-400/80">
                  {t("Failed / Restricted")} ({failedLogs.length})
                </span>
                <ChevronDownIcon
                  className="size-3.5 text-text-tertiary"
                  open={logsFailedOpen}
                />
              </button>
              {logsFailedOpen && (
                <div className="max-h-40 overflow-y-auto font-mono text-xs bg-black/20">
                  {failedLogs.map((log, i) => (
                    <LogRow key={i} log={log} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* successful */}
          {successLogs.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setLogsSuccessOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-subtle transition-colors"
              >
                <span className="text-xs font-medium text-green-400/80">
                  {t("Imported")} ({successLogs.length})
                </span>
                <ChevronDownIcon
                  className="size-3.5 text-text-tertiary"
                  open={logsSuccessOpen}
                />
              </button>
              {logsSuccessOpen && (
                <div className="max-h-40 overflow-y-auto font-mono text-xs bg-black/20">
                  {successLogs.map((log, i) => (
                    <LogRow key={i} log={log} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
