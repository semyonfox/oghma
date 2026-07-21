"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon as CheckCircleOutline } from "@heroicons/react/24/outline";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  formatDateKey,
} from "@/lib/notes/utils/calendar-date";
import AssignmentTypeIcon from "@/components/assignments/assignment-type-icon";
import { getAssignmentTypeLabel, type AssignmentType } from "@/lib/notes/utils/assignment-type";

const MIN_HOUR_HEIGHT = 56;
const START_HOUR = 6;
const END_HOUR = 24;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => i + START_HOUR,
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
  onAddStudyBlock?: (date: string, start: string, end: string) => void;
}

export default function WeekView({ onSelectDate, onAddStudyBlock }: WeekViewProps) {
  const { activeLocale, t } = useI18n();
  const {
    currentDate,
    timeBlocks,
    deleteTimeBlock,
    toggleTimeBlockCompleted,
    setSelectedDate,
  } = useCalendarStore();
  const { assignments } = useAssignmentStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hourHeight, setHourHeight] = useState(MIN_HOUR_HEIGHT);

  const anchor = useMemo(() => new Date(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(anchor, activeLocale), [activeLocale, anchor]);
  const [now, setNow] = useState(() => new Date());
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(activeLocale, { hour: "numeric" }),
    [activeLocale],
  );

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
  const positioned = useMemo(() => {
    const blocks: PositionedBlock[] = [];
    for (const tb of timeBlocks) {
      const start = new Date(tb.starts_at);
      const end = new Date(tb.ends_at);
      const dateStr = formatDateKey(start);
      const colIdx = weekDays.findIndex((d) => d.date === dateStr);
      if (colIdx === -1) continue;

      const startHour = start.getHours() + start.getMinutes() / 60;
      const endHour = end.getHours() + end.getMinutes() / 60;
      const top = (startHour - START_HOUR) * hourHeight;
      const height = Math.max((endHour - startHour) * hourHeight, 14);

      blocks.push({
        id: tb.id,
        title: tb.assignment_title || tb.title || t("Study block"),
        courseColor: tb.course_color || null,
        completed: tb.completed ?? false,
        top,
        height,
        col: colIdx,
      });
    }
    return blocks;
  }, [hourHeight, timeBlocks, weekDays, t]);

  // due date markers
  const dueMarkers = useMemo(() => {
    const markers: {
      col: number;
      top: number;
      title: string;
      color: string;
      type: AssignmentType;
      typeLabel: string;
    }[] = [];
    for (const a of assignments) {
      if (!a.due_at) continue;
      const d = new Date(a.due_at);
      const dateStr = formatDateKey(d);
      const colIdx = weekDays.findIndex((wd) => wd.date === dateStr);
      if (colIdx === -1) continue;

      const hour = d.getHours() + d.getMinutes() / 60;
      markers.push({
        col: colIdx,
        top: (hour - START_HOUR) * hourHeight,
        title: a.title,
        color: a.course_color ?? "#ef4444",
        type: a.assignment_type,
        typeLabel: getAssignmentTypeLabel(a.assignment_type),
      });
    }
    return markers;
  }, [assignments, hourHeight, weekDays]);

  // current time indicator
  const todayCol = weekDays.findIndex((d) => d.isToday);
  const nowTop =
    todayCol >= 0
      ? (now.getHours() + now.getMinutes() / 60 - START_HOUR) * hourHeight
      : -1;

  // click-to-create time block
  const handleGridClick = (
    colIdx: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / hourHeight) + START_HOUR;
    const snappedMinute =
      Math.round((y % hourHeight) / (hourHeight / 2)) * 30;

    const date = weekDays[colIdx].date;
    const startHour = hour + (snappedMinute >= 60 ? 1 : 0);
    const startMin = snappedMinute % 60;

    const startDate = new Date(
      Number.parseInt(date.slice(0, 4), 10),
      Number.parseInt(date.slice(5, 7), 10) - 1,
      Number.parseInt(date.slice(8, 10), 10),
      startHour,
      startMin,
      0,
      0,
    );
    const endHour = startHour + (startMin + 30 >= 60 ? 1 : 0);
    const endMin = (startMin + 30) % 60;
    const endDate = new Date(
      Number.parseInt(date.slice(0, 4), 10),
      Number.parseInt(date.slice(5, 7), 10) - 1,
      Number.parseInt(date.slice(8, 10), 10),
      endHour,
      endMin,
      0,
      0,
    );
    setSelectedDate(date);
    const formatTime = (value: Date) =>
      `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    onAddStudyBlock?.(date, formatTime(startDate), formatTime(endDate));
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
                    ? "bg-primary-600 text-text-on-primary"
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
                <span className={`absolute right-2 text-xs tabular-nums text-text-tertiary ${hour === START_HOUR ? "top-1" : "-top-2.5"}`}>
                  {timeFormatter.format(new Date(2024, 0, 1, hour))}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day, colIdx) => (
            <div
              key={day.date}
              className="relative cursor-pointer border-r border-border-subtle"
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
                    className={`group/block absolute left-0.5 right-0.5 overflow-hidden rounded-radius-md border-l-2 bg-surface-elevated px-1.5 py-1 text-xs leading-tight shadow-sm ${block.completed ? "opacity-60" : ""}`}
                    style={{
                      top: block.top,
                      height: block.height,
                      borderColor:
                        block.courseColor ?? "var(--color-primary-500)",
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteTimeBlock(block.id);
                      }}
                      className="absolute right-0.5 top-0.5 rounded p-0.5 text-text-tertiary opacity-100 transition hover:bg-subtle hover:text-text-secondary md:opacity-0 md:group-hover/block:opacity-100"
                      aria-label={t("Delete study block")}
                      title={t("Delete study block")}
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void toggleTimeBlockCompleted(block.id);
                        }}
                        className="touch-target-44 relative shrink-0"
                        aria-label={
                          block.completed
                            ? t("Mark incomplete")
                            : t("Mark complete")
                        }
                      >
                        {block.completed ? (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-primary-500" />
                        ) : (
                          <CheckCircleOutline className="h-3.5 w-3.5 text-text-tertiary transition-colors hover:text-primary-500" />
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
                .map((marker, index) => (
                  <div
                    key={`due-${index}`}
                    className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-dashed"
                    style={{
                      top: marker.top,
                      borderColor: marker.color,
                    }}
                    title={t("Due: {title}", {
                      title: `${marker.typeLabel}: ${marker.title}`,
                    })}
                  >
                    <span
                      className="absolute right-0 top-0 flex max-w-[calc(100%-0.25rem)] -translate-y-full items-center gap-1 truncate rounded-t-radius-sm px-1 py-0.5 text-[10px] font-medium text-white shadow-sm"
                      style={{ backgroundColor: marker.color }}
                    >
                      <AssignmentTypeIcon
                        type={marker.type}
                        className="h-3 w-3 text-white"
                        label={marker.typeLabel}
                      />
                      <span className="truncate">{marker.title}</span>
                    </span>
                  </div>
                ))}

              {colIdx === todayCol && nowTop >= 0 && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500"
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
