"use client";

import AssignmentDetailsTrigger from "@/components/assignments/assignment-details-trigger";

import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon as CheckCircleOutline } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useCalendarStore from "@/lib/notes/state/calendar";
import useAssignmentStore from "@/lib/notes/state/assignments";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useAssignmentDrop from "./use-assignment-drop";
import { buildMonthCells, nextFreeStudyHour } from "@/components/calendar/month-view-utils";
import { getCelebrationOrigin, triggerCelebration } from "@/lib/celebration";

function dayOfMonth(dateStr: string): string {
  return String(Number(dateStr.split("-")[2]));
}

interface MonthViewProps {
  onSelectDate?: (date: string) => void;
}

export default function MonthView({ onSelectDate }: MonthViewProps) {
  const { activeLocale, t } = useI18n();
  const assignmentDrop = useAssignmentDrop();
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

  const anchor = new Date(currentDate);

  const weekdayFormatter = new Intl.DateTimeFormat(activeLocale, { weekday: "short" });
  const dateFormatter = new Intl.DateTimeFormat(activeLocale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // 1 january 2024 was a monday
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    weekdayFormatter.format(new Date(2024, 0, 1 + index)),
  );

  const days = buildMonthCells({
    anchorDate: anchor,
    assignments,
    timeBlocks,
    selectedDate,
    today: new Date(),
  });

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
              onDragOver={(event) => assignmentDrop.dragOver(event, day.date)}
              onDragLeave={assignmentDrop.dragLeave}
              onDrop={(event) => void assignmentDrop.drop(event, nextFreeStudyHour(day.date, timeBlocks))}
              className={`
                relative group bg-surface px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated
                ${assignmentDrop.dropDate === day.date ? "ring-2 ring-inset ring-accent bg-accent-soft" : ""}
                ${!day.isCurrentMonth ? "opacity-40" : ""}
                ${day.isSelected ? "ring-1 ring-inset ring-accent/50" : ""}
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
                    ${day.isToday ? "bg-accent font-semibold text-on-action" : ""}
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
                    className={`group/a pointer-events-none relative flex min-h-7 items-center gap-1 rounded-radius-sm border py-0.5 pl-1.5 pr-1 text-xs leading-snug ${a.status === "done" ? "border-success-500/30 bg-success-500/10" : "border-border bg-surface"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.status === "done" ? "bg-success-500" : "bg-accent"}`}
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
                      className="pointer-events-auto relative flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      aria-label={
                        a.status === "done"
                          ? t("Mark as upcoming")
                          : t("Mark as done")
                      }
                    >
                      {a.status === "done" ? (
                        <CheckCircleIcon className="h-3 w-3 text-success-500" />
                      ) : (
                        <CheckCircleOutline className="h-3 w-3 text-text-tertiary hover:text-accent transition-colors" />
                      )}
                    </button>
                    {assignment && (
                      <AssignmentDetailsTrigger
                        assignment={assignment}
                        className={`pointer-events-auto min-h-6 min-w-0 flex-1 cursor-pointer truncate rounded-radius-sm px-1 text-left text-text-secondary underline decoration-border-subtle underline-offset-4 transition-colors hover:bg-subtle hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${a.status === "done" ? "line-through opacity-60" : ""}`}
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
                      className={`group/tb pointer-events-none relative flex min-h-7 items-center gap-1 rounded-radius-sm border py-0.5 pl-1.5 pr-1 text-xs leading-snug ${tb.completed ? "border-success-500/30 bg-success-500/10" : "border-border bg-surface"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${tb.completed ? "bg-success-500" : "bg-accent"}`}
                        style={tb.courseColor && !tb.completed ? { backgroundColor: tb.courseColor } : undefined}
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
                        className="pointer-events-auto relative flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        aria-label={
                          tb.completed
                            ? t("Mark incomplete")
                            : t("Mark complete")
                        }
                      >
                        {tb.completed ? (
                          <CheckCircleIcon className="h-3 w-3 text-success-500" />
                        ) : (
                          <CheckCircleOutline className="h-3 w-3 text-text-tertiary hover:text-accent transition-colors" />
                        )}
                      </button>
                      <span className={`truncate pr-4 ${tb.completed ? "text-text-tertiary line-through opacity-60" : "text-text-secondary"}`}>
                        {tb.title || t("Study block")}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleDeleteBlock(tb.id);
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
