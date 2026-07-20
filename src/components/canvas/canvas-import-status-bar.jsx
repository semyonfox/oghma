"use client";

import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  ArrowPathIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

/**
 * Subtle bottom-bar notification for Canvas imports.
 * Sits at the very bottom of the viewport as a thin strip — not a floating toast.
 * Auto-hides after completion (with a brief "done" message).
 */
export default function CanvasImportStatusBar({
  show,
  onClose,
  progress,
  onViewLogs,
}) {
  const { t } = useI18n();
  const {
    total = 0,
    completed = 0,
    percent = 0,
    forbidden = 0,
    error = 0,
  } = progress || {};
  const [visible, setVisible] = useState(false);

  const isProcessing = total > 0 && percent < 100;
  const isComplete = total > 0 && percent === 100;
  const hasIssues = forbidden > 0 || error > 0;

  // animate in
  useEffect(() => {
    if (show) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      requestAnimationFrame(() => setVisible(false));
    }
  }, [show]);

  // auto-hide 6s after completion
  useEffect(() => {
    if (isComplete && show) {
      const timer = setTimeout(
        () => {
          setVisible(false);
          setTimeout(onClose, 300);
        },
        hasIssues ? 10000 : 6000,
      );
      return () => clearTimeout(timer);
    }
  }, [isComplete, hasIssues, show, onClose]);

  if (!show) return null;

  // build status text
  let text;
  if (isProcessing) {
    text = t("canvas.import.importing", { completed, total });
    if (forbidden > 0)
      text += t("canvas.import.restricted_suffix", { count: forbidden });
  } else if (isComplete && hasIssues) {
    const parts = [t("canvas.import.count_imported", { count: completed })];
    if (forbidden > 0)
      parts.push(t("canvas.import.count_restricted", { count: forbidden }));
    if (error > 0)
      parts.push(t("canvas.import.count_failed", { count: error }));
    text = t("canvas.import.done", { summary: parts.join(", ") });
  } else if (isComplete) {
    text = t("canvas.import.complete", { count: completed });
  } else {
    text = t("canvas.import.in_progress");
  }

  return (
    <div
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* progress track */}
      {isProcessing && (
        <div className="h-0.5 w-full bg-subtle">
          <div
            className="h-full bg-primary-500 transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* info strip */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-background/95 backdrop-blur-sm border-t border-border-subtle text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {isProcessing && (
            <ArrowPathIcon className="h-3 w-3 shrink-0 animate-spin text-primary-400" aria-hidden="true" />
          )}
          {isComplete && !hasIssues && (
            <CheckIcon className="h-3 w-3 shrink-0 text-green-400" aria-hidden="true" />
          )}
          {isComplete && hasIssues && (
            <ExclamationTriangleIcon className="h-3 w-3 shrink-0 text-orange-400" aria-hidden="true" />
          )}
          <span className="text-text-tertiary truncate">{text}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {isProcessing && (
            <span className="tabular-nums text-text-tertiary/60">
              {percent}%
            </span>
          )}
          {!isProcessing && onViewLogs && (
            <button
              onClick={onViewLogs}
              className="text-primary-400 hover:text-primary-300 font-medium"
            >
              {t("canvas.import.view_logs")}
            </button>
          )}
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-text-tertiary hover:text-text-secondary p-0.5"
          >
            <XMarkIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
