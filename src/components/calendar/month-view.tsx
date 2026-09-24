"use client";

import AssignmentDetailsTrigger from "@/components/assignments/assignment-details-trigger";

import { useMemo } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon as CheckCircleOutline } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildMonthCells } from "@/components/calendar/month-view-utils";
import { getCelebrationOrigin, triggerCelebration } from "@/lib/celebration";

function dayOfMonth(dateStr: string): string {
  return String(Number(dateStr.split("-")[2]));
}

interface MonthViewProps {
  onSelectDate?: (date: string) => void;
}

export default function MonthView({ onSelectDate }: MonthViewProps) {
  const { activeLocale, t } = useI18n();
  const {
    currentDate,
    selectedDate,
    setSelectedDate,
    deleteTimeBlock,
    toggleTimeBlockCompleted,
    timeBlocks,
    reviewDates,
  } = useCalendarStore();
  const { assignments, updateAssignment } = useAssignmentStore();

  const anchor = useMemo(() => new Date(currentDate), [currentDate]);

  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(activeLocale, { weekday: "short" }),
    [activeLocale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(activeLocale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
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

  const days = useMemo(
    () =>
      buildMonthCells({
        anchorDate: anchor,
        assignments,
        timeBlocks,
        selectedDate,
        today: new Date(),
      }),
    [anchor, assignments, timeBlocks, selectedDate],
  );

  const handleToggleBlock = async (
    id: string,
    completed: boolean,
    control: HTMLElement,
  ) => {
    const origin = completed ? undefined : getCelebrationOrigin(control);
    if (!(await toggleTimeBlockCompleted(id))) return;
    if (!completed) void triggerCelebration("assignment", origin);
  };

  const handleToggleAssignment = async (
    id: string,
    completed: boolean,
    control: HTMLElement,
  ) => {
    const origin = completed ? undefined : getCelebrationOrigin(control);
    const updated = await updateAssignment(id, {
      status: completed ? "upcoming" : "done",
    });
    if (!updated) {
      toast.error(t("Something went wrong"));
      return;
    }
    if (!completed) void triggerCelebration("assignment", origin);
  };

  return (
    <div
      className="h-full overflow-x-auto overscroll-x-contain"
      aria-label={t("Month view")}
    >
      <div className="flex h-full min-w-[42rem] flex-col md:min-w-0">
      {/* day headers */}
      <div className="grid grid-cols-7 gap-px border-b border-border-subtle bg-subtle text-center text-xs font-medium text-text-tertiary">
        {weekdayLabels.map((d) => (
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
                onClick={() => {
                  setSelectedDate(day.date);
                  onSelectDate?.(day.date);
                }}
                className="absolute inset-0 z-0 text-left"
                aria-label={t("Select {date}", {
                  date: dateFormatter.format(new Date(`${day.date}T12:00:00`)),
                })}
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
                {day.assignments.slice(0, 2).map((a) => {
                  const assignment = assignments.find(item => item.id === a.id);
                  return (
                  <div
                    key={a.id}
                    className="group/a pointer-events-none relative flex min-h-7 items-center gap-1 rounded-radius-sm bg-surface-elevated py-0.5 pl-2 pr-1 text-xs leading-snug"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full"
                      style={{
                        backgroundColor: a.courseColor ?? "var(--color-primary-500)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleToggleAssignment(
                          a.id,
                          a.status === "done",
                          e.currentTarget,
                        );
                      }}
                      className="pointer-events-auto relative flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
                      aria-label={
                        a.status === "done"
                          ? t("Mark as upcoming")
                          : t("Mark as done")
                      }
                    >
                      {a.status === "done" ? (
                        <CheckCircleIcon className="h-3 w-3 text-primary-500" />
                      ) : (
                        <CheckCircleOutline className="h-3 w-3 text-text-tertiary hover:text-primary-500 transition-colors" />
                      )}
                    </button>
                    {assignment && (
                      <AssignmentDetailsTrigger
                        assignment={assignment}
                        className={`pointer-events-auto min-h-6 min-w-0 flex-1 cursor-pointer truncate rounded-radius-sm px-1 text-left text-text-secondary underline decoration-border-subtle underline-offset-4 transition-colors hover:bg-subtle hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 ${a.status === "done" ? "line-through opacity-60" : ""}`}
                      />
                    )}
                  </div>
                  );
                })}
                {day.timeBlocks
                  .slice(0, Math.max(0, 2 - day.assignments.length))
                  .map((tb) => (
                    <div
                      key={tb.id}
                      className="group/tb pointer-events-none relative flex min-h-7 items-center gap-1 rounded-radius-sm bg-surface-elevated py-0.5 pl-2 pr-1 text-xs leading-snug"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full"
                        style={{
                          backgroundColor: tb.courseColor ?? "var(--color-primary-500)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleToggleBlock(
                            tb.id,
                            tb.completed,
                            e.currentTarget,
                          );
                        }}
                        className="pointer-events-auto relative flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
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
