"use client";

import AssignmentDetailsTrigger from "@/components/assignments/assignment-details-trigger";
import type { Assignment } from "@/lib/notes/state/assignments";

import { useEffect, useRef, useState } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon as CheckCircleOutline } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useCalendarStore from "@/lib/notes/state/calendar";
import useAssignmentStore from "@/lib/notes/state/assignments";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { getCelebrationOrigin, triggerCelebration } from "@/lib/celebration";
import {
  formatDateKey,
} from "@/lib/notes/utils/calendar-date";
import AssignmentTypeIcon from "@/components/assignments/assignment-type-icon";
import { getAssignmentTypeLabel, type AssignmentType } from "@/lib/notes/utils/assignment-type";
import {
  WEEK_END_HOUR,
  WEEK_START_HOUR,
  weekGridBlockPosition,
  weekGridOffset,
  weekGridSlot,
} from "@/components/calendar/week-view-utils";

import useAssignmentDrop from "./use-assignment-drop";

const MIN_HOUR_HEIGHT = 56;
const HOURS = Array.from(
  { length: WEEK_END_HOUR - WEEK_START_HOUR },
  (_, i) => i + WEEK_START_HOUR,
);

function getWeekDays(
  anchor: Date,
  locale: string,
): { date: string; label: string; dayNum: string; isToday: boolean }[] {
  const d = new Date(anchor);
  const dow = (d.getDay() + 6) % 7; // monday=0
  d.setDate(d.getDate() - dow);

  const today = new Date();
  const todayStr = formatDateKey(today);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    const dateStr = formatDateKey(day);
    return {
      date: dateStr,
      label: day.toLocaleDateString(locale, { weekday: "short" }),
      dayNum: String(day.getDate()),
      isToday: dateStr === todayStr,
    };
  });
}

interface PositionedBlock {
  id: string;
  title: string;
  courseColor: string | null;
  completed: boolean;
  top: number;
  height: number;
  col: number;
}

interface WeekViewProps {
  onSelectDate?: (date: string) => void;
  onAddTask?: (date: string, start: string) => void;
}

export default function WeekView({ onSelectDate, onAddTask }: WeekViewProps) {
  const { activeLocale, t } = useI18n();
  const assignmentDrop = useAssignmentDrop();
  const {
    currentDate,
    timeBlocks,
    deleteTimeBlock,
    toggleTimeBlockCompleted,
    setSelectedDate,
  } = useCalendarStore();
  const { assignments, updateAssignment } = useAssignmentStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hourHeight, setHourHeight] = useState(MIN_HOUR_HEIGHT);

  const anchor = new Date(currentDate);
  const weekDays = getWeekDays(anchor, activeLocale);
  const [now, setNow] = useState(() => new Date());
  const timeFormatter = new Intl.DateTimeFormat(activeLocale, { hour: "numeric" });

  const handleToggleBlock = async (
    id: string,
    completed: boolean,
    control: HTMLElement,
  ) => {
    const origin = completed ? undefined : getCelebrationOrigin(control);
    if (!(await toggleTimeBlockCompleted(id))) {
      toast.error(t("Something went wrong"));
      return;
    }
    if (!completed) void triggerCelebration("assignment", origin);
  };

  const handleDeleteBlock = async (id: string) => {
    if (!(await deleteTimeBlock(id))) {
      toast.error(t("Something went wrong"));
    }
  };

  const handleToggleAssignment = async (
    assignment: Assignment,
    control: HTMLElement,
  ) => {
    const completed = assignment.status === "done";
    const origin = completed ? undefined : getCelebrationOrigin(control);
    const updated = await updateAssignment(assignment.id, {
      status: completed ? "upcoming" : "done",
    });
    if (!updated) {
      toast.error(t("Something went wrong"));
      return;
    }
    if (!completed) void triggerCelebration("assignment", origin);
  };

  useEffect(() => {
    const update = () => setNow(new Date());
    const delay = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      update();
      interval = window.setInterval(update, 60_000);
    }, delay);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const updateHourHeight = () => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const availableHeight = Math.max(0, scroll.clientHeight - headerHeight);
      setHourHeight(Math.max(MIN_HOUR_HEIGHT, availableHeight / HOURS.length));
    };

    updateHourHeight();
    const observer = new ResizeObserver(updateHourHeight);
    observer.observe(scroll);
    if (headerRef.current) observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  // position time blocks on the grid
  const positioned: PositionedBlock[] = [];
  for (const tb of timeBlocks) {
    const start = new Date(tb.starts_at);
    const end = new Date(tb.ends_at);
    const dateStr = formatDateKey(start);
    const colIdx = weekDays.findIndex((d) => d.date === dateStr);
    if (colIdx === -1) continue;

    const { top, height } = weekGridBlockPosition(start, end, hourHeight);

    positioned.push({
      id: tb.id,
      title: tb.assignment_title || tb.title || t("Study block"),
      courseColor: tb.course_color || null,
      completed: tb.completed ?? false,
      top,
      height,
      col: colIdx,
    });
  }

  // due date markers
  const dueMarkers: {
    assignment: Assignment;
    col: number;
    top: number;
    title: string;
    type: AssignmentType;
    typeLabel: string;
  }[] = [];
  for (const a of assignments) {
    if (!a.due_at) continue;
    const d = new Date(a.due_at);
    const dateStr = formatDateKey(d);
    const colIdx = weekDays.findIndex((wd) => wd.date === dateStr);
    if (colIdx === -1) continue;

    dueMarkers.push({
      assignment: a,
      col: colIdx,
      top: weekGridOffset(d, hourHeight),
      title: a.title,
      type: a.assignment_type,
      typeLabel: getAssignmentTypeLabel(a.assignment_type),
    });
  }

  // current time indicator
  const todayCol = weekDays.findIndex((d) => d.isToday);
  const nowTop =
    todayCol >= 0
      ? (now.getHours() + now.getMinutes() / 60 - WEEK_START_HOUR) * hourHeight
      : -1;

  // Clicking a time slot starts the same task flow used elsewhere, prefilled
  // with the chosen deadline.
  const handleGridClick = (
    colIdx: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const date = weekDays[colIdx].date;
    const startDate = weekGridSlot(date, e.clientY - rect.top, hourHeight);
    setSelectedDate(date);
    const formatTime = (value: Date) =>
      `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    onAddTask?.(date, formatTime(startDate));
  };

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto overscroll-contain"
      aria-label={t("Week view")}
    >
      <div className="relative min-h-full min-w-[52rem] md:min-w-0">
        <div
          ref={headerRef}
          className="sticky top-0 z-30 grid border-b border-border-subtle bg-surface"
          style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}
        >
          <div className="sticky left-0 z-40 border-r border-border-subtle bg-surface" />
          {weekDays.map((day) => (
            <div
              key={day.date}
              className="flex flex-col items-center bg-surface py-2 text-xs text-text-tertiary"
            >
              <button
                type="button"
                className="flex min-h-11 w-full flex-col items-center justify-center"
                onClick={() => {
                  setSelectedDate(day.date);
                  onSelectDate?.(day.date);
                }}
                aria-label={t("Select {date}", { date: day.date })}
              >
              <span>{day.label}</span>
              <span
                className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  day.isToday
                    ? "bg-accent text-on-action"
                    : "text-text-secondary"
                }`}
              >
                {day.dayNum}
              </span>
              </button>
            </div>
          ))}
        </div>

        <div
          ref={gridRef}
          className="relative grid"
          style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}
        >
          <div className="sticky left-0 z-20 border-r border-border-subtle bg-surface">
            {HOURS.map((hour) => (
              <div key={hour} style={{ height: hourHeight }} className="relative">
                <span className={`absolute right-2 text-xs tabular-nums text-text-tertiary ${hour === WEEK_START_HOUR ? "top-1" : "-top-2.5"}`}>
                  {timeFormatter.format(new Date(2024, 0, 1, hour))}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day, colIdx) => (
            <div
              key={day.date}
              className={`relative cursor-pointer border-r border-border-subtle ${assignmentDrop.dropDate === day.date ? "bg-accent-soft ring-2 ring-inset ring-accent" : ""}`}
              onDragOver={(event) => assignmentDrop.dragOver(event, day.date)}
              onDragLeave={assignmentDrop.dragLeave}
              onDrop={(event) => {
                const rect = gridRef.current?.getBoundingClientRect();
                if (rect) void assignmentDrop.drop(event, weekGridSlot(day.date, event.clientY - rect.top, hourHeight));
              }}
              onClick={(event) => handleGridClick(colIdx, event)}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: hourHeight }}
                  className="border-b border-subtle"
                />
              ))}

              {positioned
                .filter((block) => block.col === colIdx)
                .map((block) => (
                  <div
                    key={block.id}
                    className={`group/block absolute left-0.5 right-0.5 overflow-hidden rounded-radius-md border px-1.5 py-1 text-xs leading-tight ${block.completed ? "border-success-500/30 bg-success-500/10" : "border-border bg-surface"}`}
                    style={{
                      top: block.top,
                      height: block.height,
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleDeleteBlock(block.id);
                      }}
                      className="absolute right-0.5 top-0.5 rounded p-0.5 text-text-tertiary opacity-100 transition hover:bg-subtle hover:text-text-secondary md:opacity-0 md:group-hover/block:opacity-100"
                      aria-label={t("Delete study block")}
                      title={t("Delete study block")}
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${block.completed ? "bg-success-500" : "bg-accent"}`}
                        style={block.courseColor && !block.completed ? { backgroundColor: block.courseColor } : undefined}
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleToggleBlock(
                            block.id,
                            block.completed,
                            event.currentTarget,
                          );
                        }}
                        className="touch-target-44 relative shrink-0"
                        aria-label={
                          block.completed
                            ? t("Mark incomplete")
                            : t("Mark complete")
                        }
                      >
                        {block.completed ? (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-success-500" />
                        ) : (
                          <CheckCircleOutline className="h-3.5 w-3.5 text-text-tertiary transition-colors hover:text-accent" />
                        )}
                      </button>
                      <p
                        className={`truncate pr-4 font-medium ${
                          block.completed
                            ? "text-text-tertiary line-through"
                            : "text-text-secondary"
                        }`}
                      >
                        {block.title}
                      </p>
                    </div>
                  </div>
                ))}

              {dueMarkers
                .filter((marker) => marker.col === colIdx)
                .map((marker) => (
                  <div
                    key={`due-${marker.assignment.id}`}
                    className={`pointer-events-none absolute left-0 right-0 z-10 border-t border-dashed ${marker.assignment.status === "done" ? "border-success-500/50" : "border-border-strong"}`}
                    style={{
                      top: marker.top,
                    }}
                    title={t("Due: {title}", {
                      title: `${marker.typeLabel}: ${marker.title}`,
                    })}
                  >
                    <span
                      className={`pointer-events-auto absolute right-0.5 top-0 flex max-w-[calc(100%-0.25rem)] -translate-y-[calc(100%+2px)] items-center gap-0.5 rounded-radius-sm border px-1 py-0.5 text-[10px] font-medium ${marker.assignment.status === "done" ? "border-success-500/30 bg-success-500/10 text-text-tertiary" : "border-border bg-surface text-text-secondary"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${marker.assignment.status === "done" ? "bg-success-500" : "bg-accent"}`}
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleToggleAssignment(
                            marker.assignment,
                            event.currentTarget,
                          );
                        }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-radius-sm transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label={
                          marker.assignment.status === "done"
                            ? t("Mark as upcoming")
                            : t("Mark as done")
                        }
                      >
                        {marker.assignment.status === "done" ? (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-success-500" />
                        ) : (
                          <CheckCircleOutline className="h-3.5 w-3.5 text-text-tertiary" />
                        )}
                      </button>
                      <AssignmentTypeIcon
                        type={marker.type}
                        className="h-3 w-3 shrink-0 text-text-tertiary"
                        label={marker.typeLabel}
                      />
                      <AssignmentDetailsTrigger
                        assignment={marker.assignment}
                        className={`min-h-5 min-w-0 cursor-pointer truncate rounded-radius-sm px-0.5 text-left underline decoration-border-strong underline-offset-2 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${marker.assignment.status === "done" ? "line-through opacity-70" : ""}`}
                      />
                    </span>
                  </div>
                ))}

              {colIdx === todayCol && nowTop >= 0 && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-accent"
                  style={{ top: nowTop }}
                >
                  <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-accent" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
