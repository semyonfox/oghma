"use client";

import useAssignmentStore from "@/lib/notes/state/assignments";
import useCalendarStore from "@/lib/notes/state/calendar";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildMonthCells } from "@/components/calendar/month-view-utils";
import {
  formatDateKey,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";
import DayAgenda from "@/components/calendar/day-agenda";
import DayStrip from "@/components/calendar/day-strip";
import { ClipboardDocumentListIcon } from "@heroicons/react/20/solid";

interface MobileCalendarProps {
  onAddTask: () => void;
  onRetry: () => void;
  onOpenTasks?: () => void;
  monthOpen?: boolean;
  onToggleMonth?: () => void;
}

function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.split("-")[2]));
}

export default function MobileCalendar({
  onAddTask,
  onRetry,
  onOpenTasks,
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
  const anchor = new Date(currentDate);
  const today = formatDateKey(new Date());
  const weekdayFormatter = new Intl.DateTimeFormat(activeLocale, { weekday: "narrow" });
  const fullDateFormatter = new Intl.DateTimeFormat(activeLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // 1 january 2024 was a monday
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    weekdayFormatter.format(new Date(2024, 0, 1 + index)),
  );
  const monthDays = buildMonthCells({
    anchorDate: anchor,
    assignments,
    timeBlocks,
    selectedDate,
    today: new Date(),
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border-subtle bg-surface px-3 pt-2">
        <div className="flex items-center justify-between gap-2 pb-1">
          <div
            role="group"
            aria-label={t("Calendar")}
            className="flex gap-0.5 rounded-[9px] border border-border bg-subtle p-[3px]"
          >
            <button
              type="button"
              onClick={() => { if (!monthOpen) onToggleMonth(); }}
              aria-expanded={monthOpen}
              aria-controls="mobile-calendar-month"
              className={`h-[30px] rounded-[6px] px-3.5 text-[13px] transition-colors ${monthOpen ? "atlas-raised font-semibold text-text" : "text-text-secondary"}`}
            >
              {t("Month")}
            </button>
            <button
              type="button"
              onClick={() => { if (monthOpen) onToggleMonth(); }}
              aria-pressed={!monthOpen}
              className={`h-[30px] rounded-[6px] px-3.5 text-[13px] transition-colors ${!monthOpen ? "atlas-raised font-semibold text-text" : "text-text-secondary"}`}
            >
              {t("Week")}
            </button>
          </div>
          {onOpenTasks && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="-mr-1 flex min-h-11 items-center justify-center gap-1.5 rounded-radius-md px-2 text-sm font-medium text-text-secondary transition-colors hover:bg-subtle"
            >
              <ClipboardDocumentListIcon className="h-5 w-5" aria-hidden="true" />
              {t("Tasks")}
            </button>
          )}
        </div>
        <div className="-mx-3 pb-1">
          <DayStrip
            selectedDate={selectedDate}
            today={today}
            onSelect={setSelectedDate}
            weekdayFormatter={weekdayFormatter}
            fullDateFormatter={fullDateFormatter}
            label={t("Select date")}
          />
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
                    className={`relative flex aspect-square min-h-11 min-w-0 flex-col items-center justify-center text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                      day.isSelected
                        ? "bg-text text-background"
                        : day.isToday
                          ? "bg-accent font-semibold text-on-action"
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
                              day.isSelected ? "bg-background" : day.isToday ? "bg-on-action" : "bg-accent"
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
