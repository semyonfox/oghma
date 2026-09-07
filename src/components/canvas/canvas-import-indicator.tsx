"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  ArrowDownTrayIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useCanvasImportNotification } from "./canvas-import-notifications";

export default function CanvasImportIndicator({
  variant = "rail",
  onNavigate,
}: {
  variant?: "rail" | "drawer";
  onNavigate?: () => void;
}) {
  const status = useCanvasImportNotification();
  const { t } = useI18n();
  if (!status) return null;

  const { progress, isImporting, showToast, onToastClose } = status;
  const visible = isImporting || showToast;
  const hasIssues =
    visible &&
    ((progress?.forbidden ?? 0) > 0 ||
      (progress?.error ?? 0) > 0 ||
      progress?.failed);
  const complete = visible && !isImporting && !hasIssues;
  const rawPercent = progress?.percent ?? 0;
  const percent = Number.isFinite(rawPercent)
    ? Math.min(100, Math.max(0, rawPercent))
    : 0;
  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const summary = [
    t("canvas.import.count_imported", { count: completed }),
    ...(progress?.forbidden
      ? [t("canvas.import.count_restricted", { count: progress.forbidden })]
      : []),
    ...(progress?.error
      ? [t("canvas.import.count_failed", { count: progress.error })]
      : []),
  ].join(", ");
  const label = isImporting
    ? total > 0
      ? `${t("canvas.import.importing", { completed, total })} · ${percent}%`
      : t("canvas.import.in_progress")
    : visible
      ? progress?.failed
        ? t("Import failed")
        : hasIssues
          ? t("canvas.import.done", { summary })
          : t("canvas.import.complete", { count: completed })
      : t("Canvas course import");
  const Icon = hasIssues
    ? ExclamationTriangleIcon
    : complete
      ? CheckIcon
      : ArrowDownTrayIcon;

  return (
    <Popover className={variant === "drawer" ? "w-full" : "shrink-0"}>
      <PopoverButton
        aria-label={label}
        title={label}
        className={`flex min-h-11 items-center rounded-radius-md hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${variant === "drawer" ? "w-full gap-3 px-3 text-sm font-medium" : "h-11 w-11 justify-center"} ${hasIssues ? "text-orange-400" : complete ? "text-green-400" : isImporting ? "text-primary-400" : "text-text-tertiary"}`}
      >
        <span className="relative grid h-8 w-8 shrink-0 place-items-center">
          {visible && (
            <svg
              viewBox="0 0 32 32"
              fill="none"
              strokeWidth="1.5"
              className="pointer-events-none absolute inset-0 h-8 w-8 -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                opacity="0.22"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 14}
                strokeDashoffset={
                  2 * Math.PI * 14 * (1 - (isImporting ? percent : 100) / 100)
                }
                className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
              />
            </svg>
          )}
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {variant === "drawer" && <span>{t("Canvas course import")}</span>}
      </PopoverButton>
      <PopoverPanel
        anchor={variant === "drawer" ? "top start" : "right end"}
        className="z-[80] w-72 max-w-[calc(100vw-1rem)] rounded-radius-lg border border-border-subtle bg-surface p-4 text-sm text-text-secondary shadow-xl [--anchor-gap:8px] [--anchor-padding:8px] focus:outline-none"
      >
        {({ close }) => (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{t("Canvas course import")}</h2>
              <button
                type="button"
                aria-label={t("Close")}
                onClick={() => close()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-radius-md hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
              >
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {visible && (
              <p className="mt-2 text-xs leading-relaxed" role="status">
                {label}
              </p>
            )}
            {isImporting && total > 0 && (
              <div
                role="progressbar"
                aria-label={t("Canvas course import")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="my-3 h-1 overflow-hidden rounded-full bg-subtle"
              >
                <div
                  className="h-full bg-primary-400 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <Link
                href="/settings#canvas"
                onClick={() => {
                  close();
                  onNavigate?.();
                }}
                className="py-2 text-xs font-medium text-primary-400 hover:underline"
              >
                {t("canvas.import.view_logs")}
              </Link>
              {visible && !isImporting && (
                <button
                  type="button"
                  onClick={() => {
                    onToastClose();
                    close();
                  }}
                  className="rounded-radius-md px-2 py-2 text-xs hover:bg-subtle"
                >
                  {t("Dismiss")}
                </button>
              )}
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
