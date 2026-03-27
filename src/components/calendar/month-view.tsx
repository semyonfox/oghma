"use client";

import { useEffect, useMemo } from "react";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";

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
    timeBlocks,
    fetchTimeBlocks,
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

  const days = useMemo(() => {
    const cells = getMonthDays(anchor);

    // map assignments to their due dates
    for (const a of assignments) {
      if (!a.due_at) continue;
      const dueDate = a.due_at.slice(0, 10);
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
      const blockDate = tb.starts_at.slice(0, 10);
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
      <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2.5">
            {d}
          </div>
        ))}
      </div>

      {/* grid */}
      <div className="flex flex-1 bg-background text-xs">
        <div className="w-full grid grid-cols-7 grid-rows-6 border-t border-border-subtle">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`
                relative group border-b border-r border-border-subtle px-2 py-2 text-left transition-colors min-h-[5.5rem]
                ${day.isCurrentMonth ? "bg-background hover:bg-surface" : "bg-surface/30 hover:bg-surface/50"}
                ${day.isSelected ? "ring-2 ring-inset ring-primary-500/40 bg-primary-500/[0.03]" : ""}
              `}
            >
              <time
                dateTime={day.date}
                className={`
                  inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors
                  ${day.isToday ? "bg-primary-500 text-white shadow-sm shadow-primary-500/30" : ""}
                  ${day.isSelected && !day.isToday ? "bg-primary-500/15 text-primary-400 font-semibold" : ""}
                  ${!day.isToday && !day.isSelected && day.isCurrentMonth ? "text-text-secondary group-hover:text-text" : ""}
                  ${!day.isToday && !day.isSelected && !day.isCurrentMonth ? "text-text-tertiary/50" : ""}
                `}
              >
                {dayOfMonth(day.date)}
              </time>

              {/* events */}
              <div className="mt-1.5 space-y-1">
                {day.assignments.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight transition-colors"
                    style={{
                      backgroundColor: (a.courseColor ?? "#7c3aed") + "15",
                      color: a.courseColor ?? "#c4b5fd",
                      borderLeft: `2px solid ${a.courseColor ?? "#7c3aed"}`,
                    }}
                  >
                    {a.title}
                  </div>
                ))}
                {day.timeBlocks
                  .slice(0, Math.max(0, 2 - day.assignments.length))
                  .map((tb) => (
                    <div
                      key={tb.id}
                      className="truncate rounded-md border-l-2 border-primary-500/40 px-1.5 py-0.5 text-[10px] leading-tight bg-primary-500/10 text-primary-300"
                    >
                      {tb.title || "Study block"}
                    </div>
                  ))}
                {day.assignments.length + day.timeBlocks.length > 2 && (
                  <span className="text-[10px] text-text-tertiary font-medium pl-0.5">
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
