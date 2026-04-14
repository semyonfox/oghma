"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlayIcon,
  PlusIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import useAssignmentStore, {
  type Assignment,
  type AssignmentTab,
} from "@/lib/notes/state/assignments.zustand";
import useCourseStore from "@/lib/notes/state/courses.zustand";
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { triggerCelebration } from "@/lib/celebration";
import NewTaskModal from "./new-task-modal";

// -- concentric activity rings ---------------------------------------------

interface CourseRingData {
  name: string;
  color: string;
  done: number;
  total: number;
}

function ConcentricRings({ courses }: { courses: CourseRingData[] }) {
  if (courses.length === 0) return null;

  const size = 120;
  const cx = size / 2;
  const strokeWidth = 6;
  const gap = 3;
  // outermost radius leaves room for stroke
  const outerR = cx - strokeWidth / 2 - 1;

  return (
    <div className="flex flex-col items-center gap-2 px-3 py-3">
      {/* concentric ring SVG */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        {courses.map((c, i) => {
          const r = outerR - i * (strokeWidth + gap);
          if (r <= 0) return null;
          const circ = 2 * Math.PI * r;
          const pct = c.total > 0 ? c.done / c.total : 0;

          return (
            <g key={c.name}>
              {/* background track */}
              <circle
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-border-subtle"
              />
              {/* progress arc */}
              {pct > 0 && (
                <circle
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  strokeWidth={strokeWidth}
                  stroke={c.color}
                  strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cx})`}
                  style={{ transition: "stroke-dasharray 0.4s ease" }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="flex flex-col gap-1">
        {courses.map((c) => {
          const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
          return (
            <div
              key={c.name}
              className="flex items-center gap-1.5 text-xs text-text-tertiary leading-none"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="truncate max-w-[120px]">{c.name}</span>
              <span className="ml-auto tabular-nums opacity-70">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- helpers ---------------------------------------------------------------

function urgencyLabel(
  dueAt: string | null,
  status: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): { text: string; tone: "red" | "amber" | "muted" | "none" } {
  if (!dueAt) return { text: "", tone: "none" };
  const diff = new Date(dueAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);

  if (status === "late" || days < 0)
    return {
      text: t("assignments.overdue", { count: Math.abs(days) }),
      tone: "red",
    };
  if (days === 0) return { text: t("assignments.due_today"), tone: "red" };
  if (days === 1) return { text: t("assignments.due_tomorrow"), tone: "amber" };
  return {
    text: t("assignments.due_in_days", { count: days }),
    tone: days <= 3 ? "amber" : "muted",
  };
}

const toneFg: Record<string, string> = {
  red: "text-red-400",
  amber: "text-amber-400",
  muted: "text-text-tertiary",
  none: "text-text-tertiary",
};

function isVisibleInTab(a: Assignment, tab: AssignmentTab) {
  const isCanvasUndated = a.source === "canvas" && !a.due_at;
  if (tab === "upcoming") {
    if (isCanvasUndated) return false;
    return a.status === "upcoming" || a.status === "in_progress";
  }
  if (tab === "done") return a.status === "done";
  if (tab === "late") {
    if (isCanvasUndated) return false;
    return a.status === "late";
  }
  return true;
}

// -- main component --------------------------------------------------------

export default function AssignmentTracker() {
  const { t } = useI18n();
  const {
    assignments,
    loading,
    courseFilter,
    activeTab,
    includeAll,
    includeArchived,
    fetchAssignments,
    syncFromCanvas,
    setCourseFilter,
    setActiveTab,
    setIncludeAll,
    setIncludeArchived,
    updateAssignment,
  } = useAssignmentStore();
  const pomodoroStart = usePomodoroStore((s) => s.start);
  const [showNewTask, setShowNewTask] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchAssignments({ all: includeAll, includeArchived });
  }, [fetchAssignments, includeAll]);

  // build course list for filter dropdown
  const courses = useMemo(() => {
    const names = new Set(
      assignments.map((a) => a.course_name).filter(Boolean),
    );
    return Array.from(names) as string[];
  }, [assignments]);

  // per-course ring data -- uses visible assignments (respects course filter)
  const courseRings = useMemo<CourseRingData[]>(() => {
    const source = courseFilter
      ? assignments.filter((a) => a.course_name === courseFilter)
      : assignments;
    const map = new Map<string, CourseRingData>();
    for (const a of source) {
      const name = a.course_name ?? "Other";
      const color = a.course_color ?? "var(--color-primary-500)";
      if (!map.has(name)) map.set(name, { name, color, done: 0, total: 0 });
      const entry = map.get(name)!;
      entry.total++;
      if (a.status === "done") entry.done++;
    }
    // sort by name for stable order
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [assignments, courseFilter]);

  // filtered list for the active tab
  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (courseFilter && a.course_name !== courseFilter) return false;
      return isVisibleInTab(a, activeTab);
    });
  }, [assignments, courseFilter, activeTab]);

  // tab counts (respect course filter)
  const counts = useMemo(() => {
    const base = courseFilter
      ? assignments.filter((a) => a.course_name === courseFilter)
      : assignments;
    return {
      upcoming: base.filter((a) => isVisibleInTab(a, "upcoming")).length,
      done: base.filter((a) => isVisibleInTab(a, "done")).length,
      late: base.filter((a) => isVisibleInTab(a, "late")).length,
    };
  }, [assignments, courseFilter]);

  const handleSync = async () => {
    setSyncing(true);
    await syncFromCanvas();
    setSyncing(false);
  };

  const handleStartFocus = (a: Assignment) => {
    pomodoroStart({
      assignmentId: a.id,
      assignmentTitle: a.title,
      courseName: a.course_name ?? undefined,
      courseColor: a.course_color ?? undefined,
    });
  };

  const handleToggleDone = async (a: Assignment) => {
    const newStatus = a.status === "done" ? "upcoming" : "done";
    await updateAssignment(a.id, { status: newStatus });
    if (newStatus === "done") {
      void triggerCelebration("assignment");
    }
  };

  const tabs: { key: AssignmentTab; label: string }[] = [
    { key: "upcoming", label: t("Upcoming") },
    { key: "done", label: t("Done") },
    { key: "late", label: t("Late") },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* header row: course filter + sync */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <Listbox value={courseFilter} onChange={setCourseFilter}>
          <div className="relative flex-1">
            <ListboxButton className="relative w-full rounded-radius-md glass-card py-1.5 pl-2.5 pr-8 text-left text-xs text-text-secondary transition-colors hover:bg-white/[0.07]">
              {courseFilter || t("All Courses")}
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-3.5 w-3.5 text-text-tertiary" />
              </span>
            </ListboxButton>
            <ListboxOptions className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-radius-md glass-card py-1 text-xs shadow-lg">
              <ListboxOption
                value={null}
                className="cursor-pointer px-2.5 py-1.5 text-text-secondary hover:bg-white/[0.07] data-[focus]:bg-white/[0.07]"
              >
                {t("All Courses")}
              </ListboxOption>
              {courses.map((c) => (
                <ListboxOption
                  key={c}
                  value={c}
                  className="cursor-pointer px-2.5 py-1.5 text-text-secondary hover:bg-white/[0.07] data-[focus]:bg-white/[0.07]"
                >
                  {c}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
        <button
          onClick={() => setIncludeAll(!includeAll)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            includeAll
              ? "border-primary-500/40 bg-primary-500/15 text-primary-200"
              : "border-border-subtle bg-surface text-text-tertiary hover:text-text-secondary hover:bg-white/[0.07]"
          }`}
          title={
            includeAll ? t("Showing all assignments") : t("Get all assignments")
          }
        >
          {includeAll ? t("All") : t("Get all")}
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-radius-md p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-white/[0.07] transition-colors disabled:opacity-40"
          title={t("Sync from Canvas")}
        >
          <ArrowPathIcon
            className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* archived toggle */}
      <div className="px-3 pb-2">
        <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-border-subtle"
          />
          {t("Show archived courses")}
        </label>
      </div>

      {/* per-course completion rings */}
      <ConcentricRings courses={courseRings} />

      {/* tab bar */}
      <div className="flex mx-3 mb-2 rounded-md bg-subtle p-0.5">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              flex-1 py-1.5 text-xs font-medium text-center rounded-radius-sm transition-all
              ${
                activeTab === key
                  ? "bg-surface text-text-secondary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }
            `}
          >
            {label}
            {counts[key] > 0 && (
              <span
                className={`ml-1 text-xs ${activeTab === key ? "opacity-60" : "opacity-40"}`}
              >
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* assignment list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5 obsidian-scrollbar">
        {loading ? (
          <p className="text-xs text-text-tertiary py-8 text-center">
            {t("Loading...")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-text-tertiary py-8 text-center opacity-60">
            {activeTab === "done"
              ? t("No completed assignments")
              : t("No assignments")}
          </p>
        ) : (
          filtered.map((a) => {
            const due = urgencyLabel(a.due_at, a.status, t);
            const hoursLogged = Number(a.logged_hours) || 0;
            const hoursEst = a.estimated_hours ?? 0;
            const hoursPct =
              hoursEst > 0 ? Math.min(100, (hoursLogged / hoursEst) * 100) : 0;

            return (
              <div
                key={a.id}
                className="group glass-card-interactive rounded-radius-lg p-2.5 transition-colors"
              >
                {/* top row: done checkbox + course badge + focus button */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => handleToggleDone(a)}
                      className="shrink-0 text-text-tertiary hover:text-primary-400 transition-colors"
                      title={
                        a.status === "done"
                          ? t("Mark as upcoming")
                          : t("Mark as done")
                      }
                    >
                      {a.status === "done" ? (
                        <CheckCircleSolid className="h-4 w-4 text-primary-400" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4" />
                      )}
                    </button>
                    {a.course_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary leading-none">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              a.course_color ?? "var(--color-primary-500)",
                          }}
                        />
                        <span className="truncate">{a.course_name}</span>
                      </span>
                    )}
                  </div>
                  {a.status !== "done" && (
                    <button
                      onClick={() => handleStartFocus(a)}
                      className="shrink-0 rounded-md p-1 text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                      title={t("Start Focus")}
                    >
                      <PlayIcon className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* title */}
                <p
                  className={`mt-1 text-sm font-medium leading-snug ${a.status === "done" ? "line-through text-text-tertiary" : "text-text-secondary"}`}
                >
                  {a.title}
                </p>

                {/* meta row: due label + score */}
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  {due.text && (
                    <span className={toneFg[due.tone]}>{due.text}</span>
                  )}
                  {a.points_possible != null && (
                    <span className="text-text-tertiary">
                      {a.score != null ? `${a.score}/` : ""}
                      {a.points_possible} {t("assignments.pts")}
                    </span>
                  )}
                </div>

                {/* hour progress bar */}
                {hoursEst > 0 && (
                  <div className="mt-2">
                    <div className="h-[3px] rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${hoursPct}%`,
                          backgroundColor:
                            a.course_color ?? "var(--color-primary-500)",
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-text-tertiary opacity-70">
                      {hoursLogged.toFixed(1)}/{hoursEst}h
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* new task */}
      <div className="p-3">
        <button
          onClick={() => setShowNewTask(true)}
          className="w-full rounded-lg border border-dashed border-border-subtle py-2 text-xs text-text-tertiary hover:text-text-secondary hover:border-border transition-colors flex items-center justify-center gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("New Task")}
        </button>
      </div>

      <NewTaskModal
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        courses={courses}
      />
    </div>
  );
}
