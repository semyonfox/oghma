"use client";

// localStorage keys
export const LS_SELECTED = "canvas_selected_courses";
export const LS_ERRORS = "canvas_course_errors";
export const LS_ACTIVE_JOB = "canvas_active_job";
export const LS_FORBIDDEN = "canvas_forbidden_courses";
export const LS_SYNCED = "canvas_synced_courses";

/** Inline SVG check */
export function CheckCircleIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
      />
    </svg>
  );
}

/** Inline SVG chevron down */
export function ChevronDownIcon({ className, open }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

/** Status badge for each course */
export function CourseBadge({ status, errorMsg }) {
  const config = {
    synced: {
      color: "fill-green-400",
      text: "text-green-200",
      ring: "ring-green-400/30",
      label: "Synced",
    },
    outOfSync: {
      color: "fill-yellow-400",
      text: "text-yellow-200",
      ring: "ring-yellow-400/30",
      label: "Out of sync",
    },
    syncing: {
      color: "fill-blue-400",
      text: "text-blue-200",
      ring: "ring-blue-400/30",
      label: "Syncing",
    },
    forbidden: {
      color: "fill-orange-400",
      text: "text-orange-200",
      ring: "ring-orange-400/30",
      label: "Restricted",
    },
    error: {
      color: "fill-red-400",
      text: "text-red-200",
      ring: "ring-red-400/30",
      label: errorMsg ?? "Failed",
    },
    idle: null,
  };

  if (!config[status]) return null;

  const { color, text, ring, label } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium ${text} ring-1 ${ring}`}
    >
      <svg viewBox="0 0 6 6" aria-hidden="true" className={`size-1.5 ${color}`}>
        <circle r={3} cx={3} cy={3} />
      </svg>
      {label}
    </span>
  );
}

/** Status dot + label for a single log entry */
export function LogStatusIcon({ status }) {
  const map = {
    complete: { dot: "bg-green-400", label: "done" },
    processing: { dot: "bg-blue-400 animate-pulse", label: "processing" },
    downloading: { dot: "bg-yellow-400 animate-pulse", label: "downloading" },
    forbidden: { dot: "bg-orange-400", label: "restricted" },
    error: { dot: "bg-red-400", label: "error" },
  };
  const cfg = map[status] ?? { dot: "bg-white/30", label: status };
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

export function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}
