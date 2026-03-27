"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClockIcon,
  CheckCircleIcon,
  PlayIcon,
  FunnelIcon,
  PlusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
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
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import NewTaskModal from "./new-task-modal";

function CompletionRing({
  done,
  total,
  size = 64,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const center = size / 2;
  const r = center - 5;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        strokeWidth={4}
        className="stroke-border-subtle"
      />
      {pct > 0 && (
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="stroke-primary-500"
        />
      )}
      <text
        x={center}
        y={center - 1}
        textAnchor="middle"
        className="fill-text-secondary text-xs font-semibold"
        fontSize={13}
      >
        {total > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </text>
      <text
        x={center}
        y={center + 11}
        textAnchor="middle"
        className="fill-text-tertiary"
        fontSize={9}
      >
        {done}/{total}
      </text>
    </svg>
  );
}

function urgencyClass(dueAt: string | null): string {
  if (!dueAt) return "border-l-transparent";
  const hours = (new Date(dueAt).getTime() - Date.now()) / 3600000;
  if (hours < 0) return "border-l-red-500";
  if (hours < 24) return "border-l-red-500";
  if (hours < 72) return "border-l-amber-500";
  return "border-l-transparent";
}

function formatDue(
  dueAt: string | null,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!dueAt) return "";
  const d = new Date(dueAt);
  const now = Date.now();
  const diff = d.getTime() - now;
  const days = Math.ceil(diff / 86400000);

  if (days < 0) return t("assignments.overdue", { count: Math.abs(days) });
  if (days === 0) return t("assignments.due_today");
  if (days === 1) return t("assignments.due_tomorrow");
  return t("assignments.due_in_days", { count: days });
}

export default function AssignmentTracker() {
  const { t } = useI18n();
  const {
    assignments,
    loading,
    courseFilter,
    activeTab,
    fetchAssignments,
    syncFromCanvas,
    setCourseFilter,
    setActiveTab,
  } = useAssignmentStore();
  const pomodoroStart = usePomodoroStore((s) => s.start);
  const [showNewTask, setShowNewTask] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const courses = useMemo(() => {
    const names = new Set(
      assignments.map((a) => a.course_name).filter(Boolean),
    );
    return Array.from(names) as string[];
  }, [assignments]);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (courseFilter && a.course_name !== courseFilter) return false;
      if (activeTab === "upcoming")
        return a.status === "upcoming" || a.status === "in_progress";
      if (activeTab === "done") return a.status === "done";
      if (activeTab === "late") return a.status === "late";
      return true;
    });
  }, [assignments, courseFilter, activeTab]);

  const doneCount = assignments.filter((a) => a.status === "done").length;

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

  const tabClasses = (tab: AssignmentTab) => `
    flex-1 py-1.5 text-[11px] font-medium text-center rounded transition-colors
    ${
      activeTab === tab
        ? "bg-primary-500/20 text-primary-300"
        : "text-text-tertiary hover:text-text-secondary"
    }
  `;

  return (
    <div className="h-full flex flex-col">
      {/* course filter + sync */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Listbox value={courseFilter} onChange={setCourseFilter}>
          <div className="relative flex-1">
            <ListboxButton className="relative w-full rounded border border-border-subtle bg-surface py-1.5 pl-2.5 pr-8 text-left text-xs text-text-secondary">
              {courseFilter || t("All Courses")}
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-3.5 w-3.5 text-text-tertiary" />
              </span>
            </ListboxButton>
            <ListboxOptions className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded border border-border-subtle bg-surface py-1 text-xs shadow-lg">
              <ListboxOption
                value={null}
                className="cursor-pointer px-2.5 py-1.5 text-text-secondary hover:bg-white/5 data-[focus]:bg-white/5"
              >
                {t("All Courses")}
              </ListboxOption>
              {courses.map((c) => (
                <ListboxOption
                  key={c}
                  value={c}
                  className="cursor-pointer px-2.5 py-1.5 text-text-secondary hover:bg-white/5 data-[focus]:bg-white/5"
                >
                  {c}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-white/5 transition-colors disabled:opacity-50"
          title={t("Sync from Canvas")}
        >
          <ArrowPathIcon
            className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* completion ring */}
      <div className="flex justify-center py-2">
        <CompletionRing done={doneCount} total={assignments.length} />
      </div>

      {/* sub-tabs */}
      <div className="flex gap-1 px-3 pb-2">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={tabClasses("upcoming")}
        >
          {t("Upcoming")}
        </button>
        <button
          onClick={() => setActiveTab("done")}
          className={tabClasses("done")}
        >
          {t("Done")}
        </button>
        <button
          onClick={() => setActiveTab("late")}
          className={tabClasses("late")}
        >
          {t("Late")}
        </button>
      </div>

      {/* assignment list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2">
        {loading ? (
          <p className="text-xs text-text-tertiary py-4 text-center">
            {t("Loading...")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-text-tertiary py-4 text-center">
            {activeTab === "done"
              ? t("No completed assignments")
              : t("No assignments")}
          </p>
        ) : (
          filtered.map((a) => (
            <div
              key={a.id}
              className={`rounded border border-border-subtle border-l-[3px] bg-background p-2.5 ${urgencyClass(a.due_at)}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                {a.course_name && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/5 border-l-2"
                    style={{
                      borderColor: a.course_color ?? "var(--color-primary-500)",
                    }}
                  >
                    <span className="text-text-tertiary">{a.course_name}</span>
                  </span>
                )}
                {a.status !== "done" && (
                  <button
                    onClick={() => handleStartFocus(a)}
                    className="shrink-0 rounded p-1 text-text-tertiary hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                    title={t("Start Focus")}
                  >
                    <PlayIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs font-medium text-text-secondary leading-tight">
                {a.title}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-text-tertiary">
                {a.due_at && (
                  <span className={a.status === "late" ? "text-red-400" : ""}>
                    {formatDue(a.due_at, t)}
                  </span>
                )}
                {a.points_possible != null && (
                  <span>
                    {a.score != null ? `${a.score}/` : ""}
                    {a.points_possible} {t("assignments.pts")}
                  </span>
                )}
              </div>
              {/* allotment progress */}
              {a.estimated_hours != null && a.estimated_hours > 0 && (
                <div className="mt-2">
                  <div className="h-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary-500/60 transition-all"
                      style={{
                        width: `${Math.min(100, ((Number(a.logged_hours) || 0) / a.estimated_hours) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[9px] text-text-tertiary">
                    {(Number(a.logged_hours) || 0).toFixed(1)}/
                    {a.estimated_hours}h
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* new task button */}
      <div className="p-3">
        <button
          onClick={() => setShowNewTask(true)}
          className="w-full rounded border border-dashed border-primary-500/30 bg-primary-500/5 py-2 text-xs text-primary-400 hover:bg-primary-500/10 transition-colors flex items-center justify-center gap-1.5"
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
