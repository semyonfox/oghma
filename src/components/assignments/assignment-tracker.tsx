"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { toast } from "sonner";
import useAssignmentStore, {
  type Assignment,
  type AssignmentTab,
} from "@/lib/notes/state/assignments.zustand";
import useCourseStore from "@/lib/notes/state/courses.zustand";
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import {
  getAssignmentDueDayDifference,
  getEffectiveAssignmentStatus,
} from "@/lib/notes/utils/assignment-status";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { triggerCelebration } from "@/lib/celebration";
import {
  CourseVisibilityDialog,
  mergeCourseVisibilityItems,
  type CourseVisibilityItem,
} from "@/components/course-visibility/course-visibility-manager";
import NewTaskModal from "./new-task-modal";

interface AssignmentTrackerProps {
  surface?: "compact" | "full";
}

interface CourseRingData {
  name: string;
  color: string;
  done: number;
  total: number;
}

const tabs: AssignmentTab[] = ["upcoming", "done", "late"];

function ConcentricRings({ courses }: { courses: CourseRingData[] }) {
  if (courses.length === 0) return null;

  const size = 120;
  const center = size / 2;
  const strokeWidth = 6;
  const gap = 3;
  const outerRadius = center - strokeWidth / 2 - 1;

  return (
    <div className="hidden flex-col items-center gap-2 px-3 py-3 sm:flex">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {courses.map((course, index) => {
          const radius = outerRadius - index * (strokeWidth + gap);
          if (radius <= 0) return null;
          const circumference = 2 * Math.PI * radius;
          const progress = course.total > 0 ? course.done / course.total : 0;

          return (
            <g key={course.name}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-border-subtle"
              />
              {progress > 0 && (
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  strokeWidth={strokeWidth}
                  stroke={course.color}
                  strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${center} ${center})`}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex max-w-full flex-col gap-1">
        {courses.map((course) => {
          const progress =
            course.total > 0 ? Math.round((course.done / course.total) * 100) : 0;
          return (
            <div
              key={course.name}
              className="flex items-center gap-1.5 text-xs leading-4 text-text-tertiary"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              <span className="max-w-[120px] truncate">{course.name}</span>
              <span className="ml-auto tabular-nums opacity-70">{progress}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function urgencyLabel(
  assignment: Assignment,
  now: Date,
  t: (key: string, params?: Record<string, unknown>) => string,
): { text: string; tone: "red" | "amber" | "muted" | "none" } {
  if (!assignment.due_at) return { text: "", tone: "none" };
  const due = new Date(assignment.due_at);
  if (Number.isNaN(due.getTime())) return { text: "", tone: "none" };

  const dayDifference = getAssignmentDueDayDifference(assignment.due_at, now);
  const effectiveStatus = getEffectiveAssignmentStatus(assignment, now);
  if (effectiveStatus === "late") {
    if (dayDifference === 0) return { text: t("Overdue"), tone: "red" };
    return {
      text: t("assignments.overdue", {
        count: Math.max(1, Math.abs(dayDifference ?? -1)),
      }),
      tone: "red",
    };
  }
  if (dayDifference === 0) {
    return { text: t("assignments.due_today"), tone: "red" };
  }
  if (dayDifference === 1) {
    return { text: t("assignments.due_tomorrow"), tone: "amber" };
  }
  if (dayDifference != null && dayDifference > 1) {
    return {
      text: t("assignments.due_in_days", { count: dayDifference }),
      tone: dayDifference <= 3 ? "amber" : "muted",
    };
  }
  return { text: "", tone: "none" };
}

const toneClasses = {
  red: "text-error-400",
  amber: "text-warning-400",
  muted: "text-text-tertiary",
  none: "text-text-tertiary",
};

function isVisibleInTab(assignment: Assignment, tab: AssignmentTab, now: Date) {
  const isCanvasUndated = assignment.source === "canvas" && !assignment.due_at;
  const status = getEffectiveAssignmentStatus(assignment, now);
  if (tab === "upcoming") {
    if (isCanvasUndated) return false;
    return status === "upcoming" || status === "in_progress";
  }
  if (tab === "done") return status === "done";
  if (isCanvasUndated) return false;
  return status === "late";
}

export default function AssignmentTracker({
  surface = "compact",
}: AssignmentTrackerProps) {
  const { t } = useI18n();
  const compact = surface === "compact";
  const {
    assignments,
    loading,
    hasLoaded,
    error,
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
  const pomodoroStart = usePomodoroStore((state) => state.start);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showCourseManager, setShowCourseManager] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const previousIncludeArchived = useRef(includeArchived);
  const {
    settings,
    fetchSettings: fetchCourseSettings,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();

  useEffect(() => {
    const includeArchivedChanged = previousIncludeArchived.current !== includeArchived;
    previousIncludeArchived.current = includeArchived;
    if (includeArchivedChanged) return;
    void fetchAssignments({ all: includeAll, includeArchived });
  }, [fetchAssignments, includeAll, includeArchived]);

  useEffect(() => {
    void fetchCourseSettings().catch(() => {});
  }, [fetchCourseSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const courses = useMemo(() => {
    const names = new Set(assignments.map((assignment) => assignment.course_name).filter(Boolean));
    return Array.from(names) as string[];
  }, [assignments]);

  const courseRings = useMemo<CourseRingData[]>(() => {
    const source = courseFilter
      ? assignments.filter((assignment) => assignment.course_name === courseFilter)
      : assignments;
    const map = new Map<string, CourseRingData>();
    for (const assignment of source) {
      const name = assignment.course_name ?? "Other";
      const color = assignment.course_color ?? "var(--color-primary-500)";
      if (!map.has(name)) map.set(name, { name, color, done: 0, total: 0 });
      const entry = map.get(name)!;
      entry.total += 1;
      if (assignment.status === "done") entry.done += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, courseFilter]);

  const counts = useMemo(() => {
    const base = courseFilter
      ? assignments.filter((assignment) => assignment.course_name === courseFilter)
      : assignments;
    return {
      upcoming: base.filter((assignment) => isVisibleInTab(assignment, "upcoming", now))
        .length,
      done: base.filter((assignment) => isVisibleInTab(assignment, "done", now)).length,
      late: base.filter((assignment) => isVisibleInTab(assignment, "late", now)).length,
    };
  }, [assignments, courseFilter, now]);

  const tabLabels: Record<AssignmentTab, string> = {
    upcoming: t("Upcoming"),
    done: t("Done"),
    late: t("Overdue"),
  };

  const courseVisibilityItems = useMemo(
    () =>
      mergeCourseVisibilityItems(
        Array.from(
          assignments.reduce((map, assignment) => {
            if (!assignment.canvas_course_id || !assignment.course_name) return map;
            const current = map.get(assignment.canvas_course_id) ?? {
              courseId: assignment.canvas_course_id,
              courseName: assignment.course_name,
              count: 0,
            };
            map.set(assignment.canvas_course_id, {
              ...current,
              count: current.count + 1,
            });
            return map;
          }, new Map<number, { courseId: number; courseName: string; count: number }>()),
        ).map(([, item]) => ({
          courseId: item.courseId,
          courseName: item.courseName,
          contextText: `${item.count} ${t("Tasks")}`,
        })),
        settings,
      ),
    [assignments, settings, t],
  );

  const retry = () =>
    fetchAssignments({ all: includeAll, includeArchived });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncFromCanvas();
      if (!result) toast.error(t("Something went wrong"));
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleDone = async (assignment: Assignment) => {
    const status = assignment.status === "done" ? "upcoming" : "done";
    const updated = await updateAssignment(assignment.id, { status });
    if (!updated) {
      toast.error(t("Something went wrong"));
      return;
    }
    if (status === "done") void triggerCelebration("assignment");
  };

  const refreshAssignmentsAndSettings = async () => {
    await Promise.all([fetchCourseSettings(), retry()]);
  };

  const handleSetCourseVisibility = async (
    item: CourseVisibilityItem,
    nextActive: boolean,
  ) => {
    if (nextActive) {
      await unarchiveCourse(item.courseId);
    } else {
      await archiveCourse(item.courseId, item.courseName);
    }
    await refreshAssignmentsAndSettings();
  };

  const handleRestoreArchivedCourses = async (items: CourseVisibilityItem[]) => {
    await Promise.all(items.map((item) => unarchiveCourse(item.courseId)));
    await refreshAssignmentsAndSettings();
  };

  const renderAssignments = (tab: AssignmentTab) => {
    const filtered = assignments.filter((assignment) => {
      if (courseFilter && assignment.course_name !== courseFilter) return false;
      return isVisibleInTab(assignment, tab, now);
    });

    if (!hasLoaded && loading) {
      return (
        <p role="status" className="py-8 text-center text-xs text-text-tertiary">
          {t("Loading...")}
        </p>
      );
    }

    if (error && assignments.length === 0) {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 px-3 py-8 text-center">
          <p className="text-xs text-error-300">{t("Something went wrong")}</p>
          <button
            type="button"
            onClick={() => void retry()}
            className="min-h-11 rounded-radius-md border border-border-subtle px-4 text-xs font-medium text-text-secondary hover:bg-subtle"
          >
            {t("Try again")}
          </button>
        </div>
      );
    }

    if (filtered.length === 0) {
      const message =
        tab === "done"
          ? t("No completed tasks")
          : tab === "late"
            ? t("No overdue tasks")
            : t("No upcoming tasks");
      return (
        <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
          <p className="text-xs text-text-tertiary opacity-70">{message}</p>
        </div>
      );
    }

    return filtered.map((assignment) => {
      const due = urgencyLabel(assignment, now, t);
      const hoursLogged = Number(assignment.logged_hours) || 0;
      const hoursEstimated = assignment.estimated_hours ?? 0;
      const progress =
        hoursEstimated > 0
          ? Math.min(100, (hoursLogged / hoursEstimated) * 100)
          : 0;
      const completed = assignment.status === "done";

      return (
        <article
          key={assignment.id}
          className="glass-card-interactive rounded-radius-lg p-2.5 transition-colors"
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleToggleDone(assignment)}
                className={`flex ${compact ? "h-7 w-7" : "h-11 w-11"} shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50`}
                aria-label={completed ? t("Mark as upcoming") : t("Mark as done")}
              >
                {completed ? (
                  <CheckCircleSolid className="h-4 w-4 text-primary-400" />
                ) : (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
              </button>
              {assignment.course_name && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs leading-4 text-text-tertiary">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        assignment.course_color ?? "var(--color-primary-500)",
                    }}
                  />
                  <span className="truncate">{assignment.course_name}</span>
                </span>
              )}
            </div>
            {!completed && (
              <button
                type="button"
                onClick={() =>
                  pomodoroStart({
                    assignmentId: assignment.id,
                    assignmentTitle: assignment.title,
                    courseName: assignment.course_name ?? undefined,
                    courseColor: assignment.course_color ?? undefined,
                  })
                }
                className={`flex ${compact ? "h-7 w-7" : "h-11 w-11"} shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-primary-500/10 hover:text-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50`}
                aria-label={t("Start Focus")}
              >
                <PlayIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <h3
            className={`mt-1 text-sm font-medium leading-snug ${completed ? "text-text-tertiary line-through" : "text-text-secondary"}`}
          >
            {assignment.title}
          </h3>

          <div className="mt-1.5 flex items-center gap-2 text-xs">
            {due.text && <span className={toneClasses[due.tone]}>{due.text}</span>}
            {assignment.points_possible != null && (
              <span className="text-text-tertiary">
                {assignment.score != null ? `${assignment.score}/` : ""}
                {assignment.points_possible} {t("assignments.pts")}
              </span>
            )}
          </div>

          {hoursEstimated > 0 && (
            <div className="mt-2">
              <div className="h-[3px] rounded-full bg-subtle">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor:
                      assignment.course_color ?? "var(--color-primary-500)",
                    opacity: 0.6,
                  }}
                />
              </div>
              <p className="mt-0.5 text-xs text-text-tertiary opacity-70">
                {hoursLogged.toFixed(1)}/{hoursEstimated}h
              </p>
            </div>
          )}
        </article>
      );
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 px-3 pb-2 pt-3">
        <Listbox value={courseFilter} onChange={setCourseFilter}>
          <div className="relative z-40 min-w-0">
            <ListboxButton className={`relative flex ${compact ? "h-8" : "h-11"} w-full items-center rounded-radius-md py-1.5 pl-3 pr-9 text-left text-xs font-medium text-text-secondary glass-card-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50`}>
              <span className="min-w-0 truncate">
                {courseFilter || t("All Courses")}
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-3.5 w-3.5 text-text-tertiary" />
              </span>
            </ListboxButton>
            <ListboxOptions className="absolute z-[80] mt-1 max-h-56 w-full overflow-auto rounded-radius-md border border-border bg-app-page py-1 text-xs shadow-2xl ring-1 ring-black/20 focus:outline-none">
              <ListboxOption
                value={null}
                className={`${compact ? "min-h-8 py-1.5" : "min-h-11 py-3"} cursor-pointer bg-app-page px-3 text-text-secondary hover:bg-subtle data-[focus]:bg-subtle`}
              >
                {t("All Courses")}
              </ListboxOption>
              {courses.map((course) => (
                <ListboxOption
                  key={course}
                  value={course}
                  className={`${compact ? "min-h-8 py-1.5" : "min-h-11 py-3"} cursor-pointer bg-app-page px-3 text-text-secondary hover:bg-subtle data-[focus]:bg-subtle`}
                >
                  {course}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>

        <div className="flex items-center gap-1 rounded-radius-md bg-subtle p-1">
          <button
            type="button"
            onClick={() => setIncludeAll(!includeAll)}
            className={`${compact ? "h-7" : "h-11"} min-w-0 flex-1 rounded-radius-sm px-2 text-xs font-medium transition-colors ${
              includeAll
                ? "bg-surface text-text-secondary shadow-sm"
                : "text-text-secondary hover:bg-surface/60"
            }`}
            aria-pressed={includeAll}
          >
            {t("Get all")}
          </button>
          <button
            type="button"
            onClick={() => setShowCourseManager(true)}
            className={`${compact ? "h-7" : "h-11"} min-w-0 flex-1 rounded-radius-sm px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface/60`}
          >
            {t("Manage")}
          </button>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className={`flex ${compact ? "h-7 w-7" : "h-11 w-11"} shrink-0 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface/60 disabled:opacity-40`}
            aria-label={t("Sync from Canvas")}
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <label
        className={`mx-3 flex ${compact ? "h-8" : "min-h-11"} cursor-pointer items-center gap-2 text-xs text-text-secondary`}
      >
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => void setIncludeArchived(event.target.checked)}
          className="h-4 w-4 rounded border border-border-subtle accent-primary-500 text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
        />
        {t("Show archived courses")}
      </label>

      {surface === "full" && <ConcentricRings courses={courseRings} />}

      {error && assignments.length > 0 && (
        <div
          role="alert"
          className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-radius-md border border-error-500/20 bg-error-500/10 px-2.5 py-2"
        >
          <span className="text-xs text-error-300">{t("Something went wrong")}</span>
          <button
            type="button"
            onClick={() => void retry()}
            className="min-h-9 rounded-radius-sm px-2 text-xs font-medium text-text-secondary hover:bg-subtle"
          >
            {t("Try again")}
          </button>
        </div>
      )}

      {loading && hasLoaded && (
        <p role="status" className="px-3 pb-2 text-xs text-text-tertiary">
          {t("Loading...")}
        </p>
      )}

      <TabGroup
        selectedIndex={tabs.indexOf(activeTab)}
        onChange={(index) => setActiveTab(tabs[index])}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabList
          className="mx-3 mb-2 flex rounded-radius-md bg-subtle p-0.5"
          aria-label={t("Tasks")}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab}
              className={`${compact ? "h-8" : "min-h-11"} flex-1 rounded-radius-sm py-1.5 text-center text-xs font-medium text-text-tertiary transition-all data-selected:bg-surface data-selected:text-text-secondary data-selected:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50`}
            >
              {tabLabels[tab]}
              {counts[tab] > 0 && (
                <span className="ml-1 text-xs opacity-60">{counts[tab]}</span>
              )}
            </Tab>
          ))}
        </TabList>

        <TabPanels className="min-h-0 flex-1">
          {tabs.map((tab) => (
            <TabPanel
              key={tab}
              className="obsidian-scrollbar h-full space-y-1.5 overflow-y-auto px-3 focus:outline-none"
            >
              {renderAssignments(tab)}
            </TabPanel>
          ))}
        </TabPanels>
      </TabGroup>

      <div className="p-3">
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-radius-lg border border-dashed border-border-subtle py-2 text-xs text-text-tertiary transition-colors hover:border-border hover:text-text-secondary"
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
      <CourseVisibilityDialog
        open={showCourseManager}
        onClose={() => setShowCourseManager(false)}
        items={courseVisibilityItems}
        onToggleCourse={handleSetCourseVisibility}
        onRestoreAll={handleRestoreArchivedCourses}
      />
    </div>
  );
}
