"use client";

import { useEffect, useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import { isoToDateKey } from "@/lib/notes/utils/calendar-date";

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
  }[];
}

function getMonthDays(anchorDate: Date): DayCell[] {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const firstDay = new Date(year, month, 1);
  // monday-based: 0=Mon, 6=Sun
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: DayCell[] = [];

  // previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({
      date: formatDate(d),
      isCurrentMonth: false,
      isToday: formatDate(d) === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    });
  }

  // current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: formatDate(d),
      isCurrentMonth: true,
      isToday: formatDate(d) === todayStr,
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
      date: formatDate(d),
      isCurrentMonth: false,
      isToday: formatDate(d) === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    });
  }

  return days;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfMonth(dateStr: string): string {
  return String(Number(dateStr.split("-")[2]));
}

export default function MonthView() {
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    deleteTimeBlock,
    timeBlocks,
    fetchTimeBlocks,
    reviewDates,
    fetchReviewDates,
  } = useCalendarStore();
  const { assignments } = useAssignmentStore();

  const anchor = useMemo(() => new Date(currentDate), [currentDate]);

  // fetch time blocks for the visible range
  useEffect(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const start = new Date(year, month - 1, 20).toISOString();
    const end = new Date(year, month + 2, 10).toISOString();
    fetchTimeBlocks(start, end);
  }, [anchor, fetchTimeBlocks]);

  // fetch quiz review dates for streak badges
  useEffect(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const startDate = new Date(year, month - 1, 20);
    const start = formatDate(startDate);
    const endDate = new Date(year, month + 2, 10);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
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
    <div className="flex h-full flex-col">
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
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`
                relative group bg-surface px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated
                ${!day.isCurrentMonth ? "opacity-40" : ""}
                ${day.isSelected ? "ring-1 ring-inset ring-primary-500/50" : ""}
              `}
            >
              <time
                dateTime={day.date}
                className={`
                  inline-flex h-6 w-6 items-center justify-center rounded-full text-xs
                  ${day.isToday ? "bg-primary-500 font-semibold text-text-on-primary" : ""}
                  ${day.isSelected && !day.isToday ? "bg-subtle font-semibold text-text-secondary" : ""}
                  ${!day.isToday && !day.isSelected ? "text-text-secondary" : ""}
                `}
              >
                {dayOfMonth(day.date)}
              </time>

              {/* ogham streak badge */}
              {reviewDates.has(day.date) && (
                <span className="absolute top-1 right-1.5 text-xs text-text-tertiary opacity-60 leading-none">
                  ᚑ
                </span>
              )}

              {/* events */}
              <div className="mt-1 space-y-px">
                {day.assignments.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className="truncate rounded-sm px-1 py-px text-xs leading-snug border-l-2 bg-subtle"
                    style={{
                      borderColor: a.courseColor ?? "var(--color-primary-500)",
                    }}
                  >
                    <span className="text-text-secondary">{a.title}</span>
                  </div>
                ))}
                {day.timeBlocks
                  .slice(0, Math.max(0, 2 - day.assignments.length))
                  .map((tb) => (
                    <div
                      key={tb.id}
                      className="group/tb relative truncate rounded-sm px-1 py-px text-xs leading-snug border-l-2 border-primary-500/40 bg-subtle text-text-tertiary"
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteTimeBlock(tb.id);
                        }}
                        className="absolute right-0.5 top-0.5 rounded p-0.5 opacity-0 group-hover/tb:opacity-100 hover:bg-white/[0.07] transition"
                        aria-label="Delete study block"
                        title="Delete study block"
                      >
                        <XMarkIcon className="h-2.5 w-2.5" />
                      </button>
                      {tb.title || "Study block"}
                    </div>
                  ))}
                {day.assignments.length + day.timeBlocks.length > 2 && (
                  <span className="text-xs text-text-tertiary">
                    +{day.assignments.length + day.timeBlocks.length - 2} more
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
