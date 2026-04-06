"use client";

import { useEffect, useMemo, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";

const HOUR_HEIGHT = 56; // px per hour row
const START_HOUR = 6;
const END_HOUR = 24;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => i + START_HOUR,
);

function getWeekDays(
  anchor: Date,
): { date: string; label: string; dayNum: string; isToday: boolean }[] {
  const d = new Date(anchor);
  const dow = (d.getDay() + 6) % 7; // monday=0
  d.setDate(d.getDate() - dow);

  const today = new Date();
  const todayStr = formatDate(today);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    const dateStr = formatDate(day);
    return {
      date: dateStr,
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: String(day.getDate()),
      isToday: dateStr === todayStr,
    };
  });
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHour(h: number): string {
  if (h === 0) return "12AM";
  if (h < 12) return `${h}AM`;
  if (h === 12) return "12PM";
  return `${h - 12}PM`;
}

interface PositionedBlock {
  id: string;
  title: string;
  courseColor: string | null;
  top: number;
  height: number;
  col: number;
}

export default function WeekView() {
  const {
    currentDate,
    timeBlocks,
    fetchTimeBlocks,
    createTimeBlock,
    deleteTimeBlock,
    setSelectedDate,
  } = useCalendarStore();
  const { assignments } = useAssignmentStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const anchor = useMemo(() => new Date(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);

  // fetch time blocks for the week
  useEffect(() => {
    const start = weekDays[0].date + "T00:00:00Z";
    const end = weekDays[6].date + "T23:59:59Z";
    fetchTimeBlocks(start, end);
  }, [weekDays, fetchTimeBlocks]);

  // scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
    }
  }, []);

  // position time blocks on the grid
  const positioned = useMemo(() => {
    const blocks: PositionedBlock[] = [];
    for (const tb of timeBlocks) {
      const start = new Date(tb.starts_at);
      const end = new Date(tb.ends_at);
      const dateStr = formatDate(start);
      const colIdx = weekDays.findIndex((d) => d.date === dateStr);
      if (colIdx === -1) continue;

      const startHour = start.getHours() + start.getMinutes() / 60;
      const endHour = end.getHours() + end.getMinutes() / 60;
      const top = (startHour - START_HOUR) * HOUR_HEIGHT;
      const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 14);

      blocks.push({
        id: tb.id,
        title: tb.assignment_title || tb.title || "Study block",
        courseColor: tb.course_color || null,
        top,
        height,
        col: colIdx,
      });
    }
    return blocks;
  }, [timeBlocks, weekDays]);

  // due date markers
  const dueMarkers = useMemo(() => {
    const markers: {
      col: number;
      top: number;
      title: string;
      color: string;
    }[] = [];
    for (const a of assignments) {
      if (!a.due_at) continue;
      const d = new Date(a.due_at);
      const dateStr = formatDate(d);
      const colIdx = weekDays.findIndex((wd) => wd.date === dateStr);
      if (colIdx === -1) continue;

      const hour = d.getHours() + d.getMinutes() / 60;
      markers.push({
        col: colIdx,
        top: (hour - START_HOUR) * HOUR_HEIGHT,
        title: a.title,
        color: a.course_color ?? "#ef4444",
      });
    }
    return markers;
  }, [assignments, weekDays]);

  // current time indicator
  const now = new Date();
  const todayCol = weekDays.findIndex((d) => d.isToday);
  const nowTop =
    todayCol >= 0
      ? (now.getHours() + now.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT
      : -1;

  // click-to-create time block
  const handleGridClick = async (
    colIdx: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT) + START_HOUR;
    const snappedMinute =
      Math.round((y % HOUR_HEIGHT) / (HOUR_HEIGHT / 2)) * 30;

    const date = weekDays[colIdx].date;
    const startHour = hour + (snappedMinute >= 60 ? 1 : 0);
    const startMin = snappedMinute % 60;

    const starts_at = `${date}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`;
    const endHour = startHour + (startMin + 30 >= 60 ? 1 : 0);
    const endMin = (startMin + 30) % 60;
    const ends_at = `${date}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`;

    // prevent overlapping time blocks on the same slot
    const hasOverlap = timeBlocks.some(
      (tb) => tb.starts_at < ends_at && tb.ends_at > starts_at,
    );
    if (hasOverlap) return;

    await createTimeBlock({ starts_at, ends_at });
    setSelectedDate(date);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* day headers */}
      <div
        className="grid shrink-0 border-b border-border-subtle"
        style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}
      >
        <div className="border-r border-border-subtle" />
        {weekDays.map((d) => (
          <div
            key={d.date}
            className="flex flex-col items-center py-2 text-xs text-text-tertiary"
          >
            <span>{d.label}</span>
            <span
              className={`
              mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold
              ${d.isToday ? "bg-primary-500 text-text-on-primary" : "text-text-secondary"}
            `}
            >
              {d.dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* scrollable grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div
          className="relative"
          style={{
            gridTemplateColumns: "3.5rem repeat(7, 1fr)",
            display: "grid",
          }}
        >
          {/* hour labels */}
          <div className="sticky left-0 z-10 bg-surface border-r border-border-subtle">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                <span className="absolute -top-2.5 right-2 text-xs text-text-tertiary tabular-nums">
                  {formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* day columns */}
          {weekDays.map((d, colIdx) => (
            <div
              key={d.date}
              className="relative border-r border-border-subtle cursor-pointer"
              onClick={(e) => handleGridClick(colIdx, e)}
            >
              {/* hour grid lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_HEIGHT }}
                  className="border-b border-subtle"
                />
              ))}

              {/* time blocks */}
              {positioned
                .filter((b) => b.col === colIdx)
                .map((b) => (
                  <div
                    key={b.id}
                    className="group/block absolute left-0.5 right-0.5 rounded-radius-md overflow-hidden text-xs leading-tight px-1.5 py-1 bg-surface-elevated border-l-2 shadow-sm"
                    style={{
                      top: b.top,
                      height: b.height,
                      borderColor: b.courseColor ?? "var(--color-primary-500)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void deleteTimeBlock(b.id);
                      }}
                      className="absolute top-0.5 right-0.5 rounded p-0.5 text-text-tertiary opacity-0 group-hover/block:opacity-100 hover:bg-white/[0.07] hover:text-text-secondary transition"
                      aria-label="Delete study block"
                      title="Delete study block"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                    <p className="font-medium truncate pr-4 text-text-secondary">
                      {b.title}
                    </p>
                  </div>
                ))}

              {/* due date markers */}
              {dueMarkers
                .filter((m) => m.col === colIdx)
                .map((m, i) => (
                  <div
                    key={`due-${i}`}
                    className="absolute left-0 right-0 border-t-2 border-dashed pointer-events-none"
                    style={{
                      top: m.top,
                      borderColor: m.color,
                    }}
                    title={`Due: ${m.title}`}
                  />
                ))}

              {/* current time line */}
              {colIdx === todayCol && nowTop >= 0 && (
                <div
                  className="absolute left-0 right-0 border-t-2 border-red-500 pointer-events-none z-10"
                  style={{ top: nowTop }}
                >
                  <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
