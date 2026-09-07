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
        className="z-[80] w-60 max-w-[calc(100vw-1rem)] rounded-radius-md border border-border-subtle bg-surface px-3 py-2.5 text-xs text-text-secondary shadow-lg [--anchor-gap:8px] [--anchor-padding:8px] focus:outline-none"
      >
        {({ close }) => (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium text-text-primary">
                  {t("Canvas course import")}
                </h2>
                {visible && (
                  <p className="truncate text-[11px] leading-4" role="status">
                    {label}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={t("Close")}
                onClick={() => close()}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
              >
                <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {isImporting && total > 0 && (
              <div
                role="progressbar"
                aria-label={t("Canvas course import")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-2 h-1 overflow-hidden rounded-full bg-subtle"
              >
                <div
                  className="h-full bg-primary-400 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1">
              <Link
                href="/settings#canvas"
                onClick={() => {
                  close();
                  onNavigate?.();
                }}
                className="rounded-radius-sm px-1.5 py-1 font-medium text-primary-400 hover:bg-subtle"
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
                  className="ml-auto rounded-radius-sm px-1.5 py-1 hover:bg-subtle"
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
