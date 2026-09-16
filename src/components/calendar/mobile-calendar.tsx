"use client";

import { useMemo } from "react";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildMonthCells } from "@/components/calendar/month-view-utils";
import {
  addDaysToDateKey,
  formatDateKey,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";
import DayAgenda from "@/components/calendar/day-agenda";

interface MobileCalendarProps {
  onAddTask: () => void;
  onRetry: () => void;
  monthOpen?: boolean;
  onToggleMonth?: () => void;
}

function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.split("-")[2]));
}

export default function MobileCalendar({
  onAddTask,
  onRetry,
  monthOpen = false,
  onToggleMonth = () => {},
}: MobileCalendarProps) {
  const { activeLocale, t } = useI18n();
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    timeBlocks,
    reviewDates,
  } = useCalendarStore();
  const assignments = useAssignmentStore((state) => state.assignments);
  const anchor = useMemo(() => new Date(currentDate), [currentDate]);
  const today = formatDateKey(new Date());
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(activeLocale, { weekday: "narrow" }),
    [activeLocale],
  );
  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(activeLocale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [activeLocale],
  );
  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return weekdayFormatter.format(date);
    });
  }, [weekdayFormatter]);
  const monthDays = useMemo(
    () =>
      buildMonthCells({
        anchorDate: anchor,
        assignments,
        timeBlocks,
        selectedDate,
        today: new Date(),
      }),
    [anchor, assignments, selectedDate, timeBlocks],
  );
  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDaysToDateKey(selectedDate, index - 3),
      ),
    [selectedDate],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border-subtle bg-app-page px-3 pt-2">
        <div className="flex items-center justify-between gap-2 pb-1">
          <p className="text-xs font-medium text-text-tertiary">
            {t("Select date")}
          </p>
          <button
            type="button"
            onClick={onToggleMonth}
            aria-expanded={monthOpen}
            aria-controls="mobile-calendar-month"
            className="min-h-11 rounded-radius-md px-3 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-500/10 dark:text-primary-300"
          >
            {t(monthOpen ? "Week" : "Month")}
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 pb-2" aria-label={t("Select date")}>
          {weekDates.map((dateKey) => {
            const date = parseLocalDateKey(dateKey);
            if (!date) return null;
            const selected = dateKey === selectedDate;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                aria-pressed={selected}
                aria-label={fullDateFormatter.format(date)}
                className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-radius-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${
                  selected
                    ? "bg-primary-600 text-text-on-primary"
                    : dateKey === today
                      ? "bg-primary-500/10 font-semibold text-primary-700 dark:text-primary-300"
                      : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
                }`}
              >
                <span className="text-[10px] uppercase">{weekdayFormatter.format(date)}</span>
                <span className="mt-0.5 text-sm font-semibold">{date.getDate()}</span>
              </button>
            );
          })}
        </div>

        {monthOpen && (
          <div id="mobile-calendar-month" className="border-t border-border-subtle pb-2 pt-3">
            <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-text-tertiary">
              {weekdayLabels.map((weekday, index) => (
                <span key={`${weekday}-${index}`}>{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-radius-md border border-border-subtle bg-border-subtle">
              {monthDays.map((day) => {
                const date = parseLocalDateKey(day.date);
                if (!date) return null;
                const dotCount =
                  day.assignments.length +
                  day.timeBlocks.length +
                  (reviewDates.has(day.date) ? 1 : 0);
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={day.isSelected}
                    aria-label={fullDateFormatter.format(date)}
                    className={`relative flex aspect-square min-h-11 min-w-0 flex-col items-center justify-center text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${
                      day.isSelected
                        ? "bg-primary-600 text-text-on-primary"
                        : day.isToday
                          ? "bg-surface font-semibold text-primary-700 dark:text-primary-300"
                          : "bg-surface text-text-secondary hover:bg-surface-elevated"
                    } ${!day.isCurrentMonth ? "opacity-40" : ""}`}
                  >
                    <time dateTime={day.date}>{dayOfMonth(day.date)}</time>
                    {dotCount > 0 && (
                      <span className="mt-1 flex h-1 items-center gap-0.5" aria-hidden="true">
                        {Array.from({ length: Math.min(dotCount, 3) }, (_, index) => (
                          <span
                            key={index}
                            className={`h-1 w-1 rounded-full ${
                              day.isSelected ? "bg-text-on-primary" : "bg-primary-400"
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <DayAgenda dateKey={selectedDate} onAddTask={onAddTask} onRetry={onRetry} />
    </div>
  );
}
