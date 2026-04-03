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

export default function CanvasProgressPanel({
  isImporting,
  isSyncing,
  progress,
  importSummary,
  recentLogs,
  markerColdStarting,
}) {
  const { t } = useI18n();
  const [logsSuccessOpen, setLogsSuccessOpen] = useState(false);
  const [logsFailedOpen, setLogsFailedOpen] = useState(true);

  if (!progress) return null;

  const LogRow = ({ log }) => (
    <div
      className={`flex items-start gap-2 px-4 py-1 border-b border-white/5 last:border-0 ${
        log.status === "forbidden"
          ? "bg-orange-500/5"
          : log.status === "error"
            ? "bg-red-500/5"
            : ""
      }`}
    >
      <LogStatusIcon status={log.status} />
      <span
        className="flex-1 min-w-0 truncate text-text-tertiary"
        title={log.filename}
      >
        {log.filename}
      </span>
      {log.errorMessage && (
        <span
          className="text-red-400/80 shrink-0 max-w-[10rem] truncate"
          title={toFriendlyCanvasLogMessage(log.errorMessage)}
        >
          {toFriendlyCanvasLogMessage(log.errorMessage)}
        </span>
      )}
      <span className="shrink-0 text-text-tertiary/50">
        {relativeTime(log.updatedAt)}
      </span>
    </div>
  );

  const successLogs = recentLogs.filter((l) => l.status === "complete");
  const failedLogs = recentLogs.filter(
    (l) => l.status === "error" || l.status === "forbidden",
  );
  const activeLogs = recentLogs.filter(
    (l) => l.status === "downloading" || l.status === "processing",
  );

  return (
    <div className="glass-card rounded-radius-md overflow-hidden">
      {/* header row */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/2.5">
        <div className="flex items-center gap-2">
          {isImporting && (
            <span className="inline-block size-2 rounded-full bg-primary-400 animate-pulse" />
          )}
          <span className="text-sm font-medium text-text-secondary">
            {isImporting
              ? `${isSyncing ? t("Checking for updates...") : t("Importing...")} (${progress.completed}/${progress.total || "?"})`
              : t("Import complete")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isImporting && progress?.estimatedSecsRemaining && (
            <span className="text-xs text-text-tertiary tabular-nums">
              {formatTime(progress.estimatedSecsRemaining)} left
            </span>
          )}
          {importSummary && !isImporting && (
            <div className="flex items-center gap-2 text-xs tabular-nums">
              {importSummary.imported > 0 && (
                <span className="text-green-400">
                  {importSummary.imported} imported
                </span>
              )}
              {importSummary.forbidden > 0 && (
                <span className="text-orange-400">
                  {importSummary.forbidden} restricted
                </span>
              )}
              {importSummary.failed > 0 && (
                <span className="text-red-400">
                  {importSummary.failed} failed
                </span>
              )}
            </div>
          )}
          <span className="text-sm tabular-nums font-semibold text-text-secondary">
            {progress.percent ?? 0}%
          </span>
        </div>
      </div>

      {/* progress bar */}
      <div className="h-1.5 w-full bg-white/10">
        <div
          className={`h-full transition-all duration-500 ${isImporting ? "bg-primary-500" : "bg-green-500"}`}
          style={{ width: `${progress.percent ?? 0}%` }}
        />
      </div>

      {isImporting && markerColdStarting && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-t border-amber-500/20">
          Canvas import is warming up the document processor. The first files
          can take a few minutes.
        </div>
      )}

      {/* log panels */}
      {recentLogs.length > 0 && (
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
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/[0.07] transition-colors"
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
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/[0.07] transition-colors"
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
