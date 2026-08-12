"use client";

import {
  CheckCircleIcon as HeroCheckCircleIcon,
  ChevronDownIcon as HeroChevronDownIcon,
} from "@heroicons/react/24/outline";
import type { SVGProps } from "react";

type Translate = (key: string, params?: Record<string, unknown>) => string;
type CourseStatus = "synced" | "outOfSync" | "syncing" | "checking" | "forbidden" | "error" | "idle";
type CanvasAvailabilityStatus =
  | "current"
  | "past"
  | "pending"
  | "inaccessible"
  | "unavailable";

// localStorage keys
export const LS_SELECTED = "canvas_selected_courses";
export const LS_ERRORS = "canvas_course_errors";
export const LS_ACTIVE_JOB = "canvas_active_job";
export const LS_FORBIDDEN = "canvas_forbidden_courses";
export const LS_SYNCED = "canvas_synced_courses";

export function CheckCircleIcon({ className }: SVGProps<SVGSVGElement>) {
  return <HeroCheckCircleIcon className={className} aria-hidden="true" />;
}

export function ChevronDownIcon({ className, open }: SVGProps<SVGSVGElement> & { open?: boolean }) {
  return (
    <HeroChevronDownIcon
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    />
  );
}

/** Status badge for each course */
export function CourseBadge({ status, errorMsg, t = (value: string) => value }: { status: CourseStatus; errorMsg?: string; t?: Translate }) {
  const config: Record<CourseStatus, { color: string; text: string; ring: string; label: string; pulse?: boolean } | null> = {
    synced: {
      color: "fill-success-500",
      text: "text-text-secondary",
      ring: "ring-success-500/40",
      label: t("Synced"),
    },
    outOfSync: {
      color: "fill-yellow-500",
      text: "text-text-secondary",
      ring: "ring-yellow-500/40",
      label: t("Out of sync"),
    },
    syncing: {
      color: "fill-blue-500",
      text: "text-text-secondary",
      ring: "ring-blue-500/40",
      label: t("Syncing"),
    },
    checking: {
      color: "fill-text-tertiary",
      text: "text-text-secondary",
      ring: "ring-border-subtle",
      label: t("Checking…"),
      pulse: true,
    },
    forbidden: {
      color: "fill-orange-500",
      text: "text-text-secondary",
      ring: "ring-orange-500/40",
      label: t("Restricted"),
    },
    error: {
      color: "fill-error-500",
      text: "text-text-secondary",
      ring: "ring-error-500/40",
      label: errorMsg ?? t("Failed"),
    },
    idle: null,
  };

  if (!config[status]) return null;

  const { color, text, ring, label, pulse = false } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium ${text} ring-1 ${ring}`}
    >
      <svg
        viewBox="0 0 6 6"
        aria-hidden="true"
        className={`size-1.5 ${color} ${pulse ? "animate-pulse" : ""}`}
      >
        <circle r={3} cx={3} cy={3} />
      </svg>
      {label}
    </span>
  );
}

/** Canvas enrolment availability, independent from local import state. */
export function CanvasAvailabilityBadge({
  status,
  reasonCode,
  describedBy,
  t = (value: string) => value,
}: {
  status?: string;
  reasonCode?: string;
  describedBy?: string;
  t?: Translate;
}) {
  const config = {
    current: {
      color: "fill-success-500",
      ring: "ring-success-500/40",
      label: t("Current"),
    },
    past: {
      color: "fill-text-tertiary",
      ring: "ring-border-subtle",
      label: t("Past"),
    },
    pending: {
      color: "fill-yellow-500",
      ring: "ring-yellow-500/40",
      label: t("Pending"),
    },
    inaccessible: {
      color: "fill-text-tertiary",
      ring: "ring-border-subtle",
      label: t("Unavailable"),
    },
    unavailable: {
      color: "fill-text-tertiary",
      ring: "ring-border-subtle",
      label: t("Unavailable"),
    },
  };

  const value = status
    ? config[status as CanvasAvailabilityStatus]
    : undefined;
  if (!value) return null;

  return (
    <span
      aria-describedby={describedBy}
      data-canvas-status={status}
      data-canvas-status-reason={reasonCode ?? undefined}
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium text-text-secondary ring-1 ${value.ring}`}
    >
      <svg viewBox="0 0 6 6" aria-hidden="true" className={`size-1.5 ${value.color}`}>
        <circle r={3} cx={3} cy={3} />
      </svg>
      {value.label}
    </span>
  );
}

/** Status dot + label for a single log entry */
export function LogStatusIcon({ status, t = (value: string) => value }: { status: string; t?: Translate }) {
  const map: Record<string, { dot: string; label: string }> = {
    complete: { dot: "bg-green-400", label: t("done") },
    processing: { dot: "bg-blue-400 animate-pulse", label: t("processing") },
    downloading: { dot: "bg-yellow-400 animate-pulse", label: t("downloading") },
    forbidden: { dot: "bg-orange-400", label: t("restricted") },
    error: { dot: "bg-red-400", label: t("error") },
  };
  const cfg = map[status as keyof typeof map] ?? { dot: "bg-text-tertiary", label: status };
  return (
    <span
      className={`mt-1 inline-block size-1.5 shrink-0 rounded-full ${cfg.dot}`}
      title={cfg.label}
    />
  );
}

export function formatTime(secs: number | null | undefined) {
  if (!secs) return null;
  if (secs < 60) return `~${secs}s`;
  return `~${Math.ceil(secs / 60)}m`;
}

export function relativeTime(
  date: string | number | Date,
  t: Translate = (key, params) =>
    params?.count != null ? key.replace("{count}", String(params.count)) : key,
) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return t("just now");
  if (s < 60) return t("{count}s ago", { count: s });
  return t("{count}m ago", { count: Math.floor(s / 60) });
}
