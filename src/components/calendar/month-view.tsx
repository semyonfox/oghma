"use client";

import { useEffect, useMemo } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon as CheckCircleOutline } from "@heroicons/react/24/outline";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import {
  formatDateKey,
  isoToDateKey,
  localDateKeyRangeToIso,
} from "@/lib/notes/utils/calendar-date";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface DayCell {
  date: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  assignments: {
    id: string;
    title: string;
    courseColor: string | null;
    status: string;
  }[];
  timeBlocks: {
    id: string;
    title: string | null;
    courseColor: string | null;
    completed: boolean;
  }[];
}

function getMonthDays(anchorDate: Date): DayCell[] {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const today = new Date();
  const todayStr = formatDateKey(today);

  const firstDay = new Date(year, month, 1);
  // monday-based: 0=Mon, 6=Sun
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: DayCell[] = [];

  // previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({
      date: formatDateKey(d),
      isCurrentMonth: false,
      isToday: formatDateKey(d) === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    });
  }

  // current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: formatDateKey(d),
      isCurrentMonth: true,
      isToday: formatDateKey(d) === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    });
  }

  // fill to complete grid (6 rows of 7)
  while (days.length < 42) {
    const d = new Date(
      year,
      month + 1,
      days.length - startDow - daysInMonth + 1,
    );
    days.push({
      date: formatDateKey(d),
      isCurrentMonth: false,
      isToday: formatDateKey(d) === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    });
  }

  return days;
}

function dayOfMonth(dateStr: string): string {
  return String(Number(dateStr.split("-")[2]));
}

export default function MonthView() {
  const { t } = useI18n();
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    deleteTimeBlock,
    toggleTimeBlockCompleted,
    timeBlocks,
    fetchTimeBlocks,
    reviewDates,
    fetchReviewDates,
  } = useCalendarStore();
  const { assignments, updateAssignment } = useAssignmentStore();

  const anchor = useMemo(() => new Date(currentDate), [currentDate]);

  // fetch time blocks for the visible range
  useEffect(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const startDateKey = formatDateKey(new Date(year, month - 1, 20));
    const endDateKey = formatDateKey(new Date(year, month + 2, 10));
    const { start, end } = localDateKeyRangeToIso(startDateKey, endDateKey);
    fetchTimeBlocks(start, end);
  }, [anchor, fetchTimeBlocks]);

  // refresh when AI creates/completes a time block
  useEffect(() => {
    const refresh = () => {
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const startDateKey = formatDateKey(new Date(year, month - 1, 20));
      const endDateKey = formatDateKey(new Date(year, month + 2, 10));
      const { start, end } = localDateKeyRangeToIso(startDateKey, endDateKey);
      fetchTimeBlocks(start, end);
    };
    window.addEventListener("oghma:time-block-changed", refresh);
    return () => window.removeEventListener("oghma:time-block-changed", refresh);
  }, [anchor, fetchTimeBlocks]);

  // fetch quiz review dates for streak badges
  useEffect(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const startDate = new Date(year, month - 1, 20);
    const start = formatDateKey(startDate);
    const endDate = new Date(year, month + 2, 10);
    const end = formatDateKey(endDate);
    fetchReviewDates(start, end);
  }, [anchor, fetchReviewDates]);

  const days = useMemo(() => {
    const cells = getMonthDays(anchor);

    // map assignments to their due dates
    for (const a of assignments) {
      if (!a.due_at) continue;
      const dueDate = isoToDateKey(a.due_at);
      const cell = cells.find((c) => c.date === dueDate);
      if (cell) {
        cell.assignments.push({
          id: a.id,
          title: a.title,
          courseColor: a.course_color,
          status: a.status,
        });
      }
    }

    // map time blocks to their start dates
    for (const tb of timeBlocks) {
      const blockDate = isoToDateKey(tb.starts_at);
      const cell = cells.find((c) => c.date === blockDate);
      if (cell) {
        cell.timeBlocks.push({
          id: tb.id,
          title: tb.assignment_title || tb.title,
          courseColor: tb.course_color || null,
          completed: tb.completed ?? false,
        });
      }
    }

    // mark selected
    if (selectedDate) {
      const sel = cells.find((c) => c.date === selectedDate);
      if (sel) sel.isSelected = true;
    }

    return cells;
  }, [anchor, assignments, timeBlocks, selectedDate]);

  return (
    <div
      className="h-full overflow-x-auto overscroll-x-contain"
      aria-label={t("Month view")}
    >
      <div className="flex h-full min-w-[42rem] flex-col md:min-w-0">
      {/* day headers */}
      <div className="grid grid-cols-7 gap-px border-b border-border-subtle bg-subtle text-center text-xs font-medium text-text-tertiary">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-surface py-2">
            {d}
          </div>
        ))}
      </div>

      {/* grid */}
      <div className="flex flex-1 bg-subtle text-xs text-text-tertiary">
        <div className="w-full grid grid-cols-7 grid-rows-6 gap-px">
          {days.map((day) => (
            <div
              key={day.date}
              className={`
                relative group bg-surface px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated
                ${!day.isCurrentMonth ? "opacity-40" : ""}
                ${day.isSelected ? "ring-1 ring-inset ring-primary-500/50" : ""}
              `}
            >
              <button
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className="absolute inset-0 z-0 text-left"
                aria-label={t("Select {date}", { date: day.date })}
              >
                <time
                  dateTime={day.date}
                  className={`
                    absolute left-2 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs
                    ${day.isToday ? "bg-primary-600 font-semibold text-text-on-primary" : ""}
                    ${day.isSelected && !day.isToday ? "bg-subtle font-semibold text-text-secondary" : ""}
                    ${!day.isToday && !day.isSelected ? "text-text-secondary" : ""}
                  `}
                >
                  {dayOfMonth(day.date)}
                </time>
              </button>

              {/* ogham streak badge */}
              {reviewDates.has(day.date) && (
                <span className="pointer-events-none absolute top-1 right-1.5 z-10 text-xs text-text-tertiary opacity-60 leading-4">
                  ᚑ
                </span>
              )}

              {/* events */}
              <div className="pointer-events-none relative z-10 mt-7 space-y-0.5">
                {day.assignments.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className="group/a pointer-events-none relative flex items-center gap-0.5 rounded-radius-md px-1 py-0.5 text-xs leading-snug border-l-2 bg-surface-elevated shadow-sm"
                    style={{
                      borderColor: a.courseColor ?? "var(--color-primary-500)",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void updateAssignment(a.id, {
                          status: a.status === "done" ? "upcoming" : "done",
                        });
                      }}
                      className="touch-target-44 pointer-events-auto relative shrink-0"
                      aria-label={
                        a.status === "done"
                          ? t("Mark incomplete")
                          : t("Mark complete")
                      }
                    >
                      {a.status === "done" ? (
                        <CheckCircleIcon className="h-3 w-3 text-primary-500" />
                      ) : (
                        <CheckCircleOutline className="h-3 w-3 text-text-tertiary hover:text-primary-500 transition-colors" />
                      )}
                    </button>
                    <span className={`truncate text-text-secondary ${a.status === "done" ? "line-through opacity-60" : ""}`}>
                      {a.title}
                    </span>
                  </div>
                ))}
                {day.timeBlocks
                  .slice(0, Math.max(0, 2 - day.assignments.length))
                  .map((tb) => (
                    <div
                      key={tb.id}
                      className="group/tb pointer-events-none relative flex items-center gap-0.5 rounded-radius-md px-1 py-0.5 text-xs leading-snug border-l-2 bg-surface-elevated shadow-sm"
                      style={{
                        borderColor: tb.courseColor ?? "var(--color-primary-500)",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void toggleTimeBlockCompleted(tb.id);
                        }}
                        className="touch-target-44 pointer-events-auto relative shrink-0"
                        aria-label={
                          tb.completed
                            ? t("Mark incomplete")
                            : t("Mark complete")
                        }
                      >
                        {tb.completed ? (
                          <CheckCircleIcon className="h-3 w-3 text-primary-500" />
                        ) : (
                          <CheckCircleOutline className="h-3 w-3 text-text-tertiary hover:text-primary-500 transition-colors" />
                        )}
                      </button>
                      <span className={`truncate pr-4 ${tb.completed ? "text-text-tertiary line-through opacity-60" : "text-text-secondary"}`}>
                        {tb.title || t("Study block")}
                      </span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteTimeBlock(tb.id);
                        }}
                        className="pointer-events-auto absolute right-0.5 top-0.5 rounded p-0.5 opacity-100 transition hover:bg-subtle md:opacity-0 md:group-hover/tb:opacity-100"
                        aria-label={t("Delete study block")}
                        title={t("Delete study block")}
                      >
                        <XMarkIcon className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                {day.assignments.length + day.timeBlocks.length > 2 && (
                  <span className="text-xs text-text-tertiary">
                    {t("+{count} more", {
                      count: day.assignments.length + day.timeBlocks.length - 2,
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
