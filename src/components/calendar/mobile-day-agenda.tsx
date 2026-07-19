"use client";

import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import {
  addDaysToDateKey,
  formatDateKey,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";
import useI18n from "@/lib/notes/hooks/use-i18n";
import DayAgenda from "@/components/calendar/day-agenda";

interface MobileDayAgendaProps {
  onAddStudyBlock: () => void;
  onRetry: () => void;
}

export default function MobileDayAgenda({
  onAddStudyBlock,
  onRetry,
}: MobileDayAgendaProps) {
  const { activeLocale, t } = useI18n();
  const selectedDate = useCalendarStore((state) => state.selectedDate);
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate);
  const today = formatDateKey(new Date());
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDaysToDateKey(selectedDate, index - 3),
  );
  const weekdayFormatter = new Intl.DateTimeFormat(activeLocale, {
    weekday: "narrow",
  });
  const fullDateFormatter = new Intl.DateTimeFormat(activeLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border-subtle px-2 py-2">
        <label className="sr-only" htmlFor="mobile-calendar-date">
          {t("Select date")}
        </label>
        <input
          id="mobile-calendar-date"
          type="date"
          value={selectedDate}
          onChange={(event) => {
            if (event.target.value) setSelectedDate(event.target.value);
          }}
          className="mb-2 min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-3 text-sm text-text-secondary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
        />

        <div className="grid grid-cols-7 gap-1" aria-label={t("Select date") }>
          {dates.map((dateKey) => {
            const date = parseLocalDateKey(dateKey);
            if (!date) return null;
            const selected = dateKey === selectedDate;
            const isToday = dateKey === today;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                aria-pressed={selected}
                aria-label={fullDateFormatter.format(date)}
                className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-radius-md px-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${
                  selected
                    ? "bg-primary-600 text-text-on-primary"
                    : isToday
                      ? "bg-primary-500/10 font-semibold text-primary-300"
                      : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
                }`}
              >
                <span className="text-[10px] uppercase">
                  {weekdayFormatter.format(date)}
                </span>
                <span className="text-sm font-semibold">{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DayAgenda
        dateKey={selectedDate}
        onAddStudyBlock={onAddStudyBlock}
        onRetry={onRetry}
      />
    </div>
  );
}
