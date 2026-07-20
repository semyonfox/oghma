"use client";

import {
  CheckCircleIcon as HeroCheckCircleIcon,
  ChevronDownIcon as HeroChevronDownIcon,
} from "@heroicons/react/24/outline";

// localStorage keys
export const LS_SELECTED = "canvas_selected_courses";
export const LS_ERRORS = "canvas_course_errors";
export const LS_ACTIVE_JOB = "canvas_active_job";
export const LS_FORBIDDEN = "canvas_forbidden_courses";
export const LS_SYNCED = "canvas_synced_courses";

export function CheckCircleIcon({ className }) {
  return <HeroCheckCircleIcon className={className} aria-hidden="true" />;
}

export function ChevronDownIcon({ className, open }) {
  return (
    <HeroChevronDownIcon
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    />
  );
}

/** Status badge for each course */
export function CourseBadge({ status, errorMsg, t = (value) => value }) {
  const config = {
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

  const { color, text, ring, label, pulse } = config[status];
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

/** Status dot + label for a single log entry */
export function LogStatusIcon({ status, t = (value) => value }) {
  const map = {
    complete: { dot: "bg-green-400", label: t("done") },
    processing: { dot: "bg-blue-400 animate-pulse", label: t("processing") },
    downloading: { dot: "bg-yellow-400 animate-pulse", label: t("downloading") },
    forbidden: { dot: "bg-orange-400", label: t("restricted") },
    error: { dot: "bg-red-400", label: t("error") },
  };
  const cfg = map[status] ?? { dot: "bg-text-tertiary", label: status };
  return (
    <span
      className={`mt-1 inline-block size-1.5 shrink-0 rounded-full ${cfg.dot}`}
      title={cfg.label}
    />
  );
}

export function formatTime(secs) {
  if (!secs) return null;
  if (secs < 60) return `~${secs}s`;
  return `~${Math.ceil(secs / 60)}m`;
}

export function relativeTime(
  date,
  t = (key, params) =>
    params?.count != null ? key.replace("{count}", params.count) : key,
) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return t("just now");
  if (s < 60) return t("{count}s ago", { count: s });
  return t("{count}m ago", { count: Math.floor(s / 60) });
}
