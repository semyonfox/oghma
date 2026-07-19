"use client";

import {
  CheckCircleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
import { toast } from "sonner";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import { isoToDateKey, parseLocalDateKey } from "@/lib/notes/utils/calendar-date";
import { getEffectiveAssignmentStatus } from "@/lib/notes/utils/assignment-status";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface DayAgendaProps {
  dateKey: string;
  onAddStudyBlock: () => void;
  onRetry: () => void;
  showHeading?: boolean;
}

export default function DayAgenda({
  dateKey,
  onAddStudyBlock,
  onRetry,
  showHeading = true,
}: DayAgendaProps) {
  const { t, activeLocale } = useI18n();
  const {
    assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    updateAssignment,
  } = useAssignmentStore();
  const {
    timeBlocks,
    loading: blocksLoading,
    error: blocksError,
    reviewDates,
    toggleTimeBlockCompleted,
    deleteTimeBlock,
  } = useCalendarStore();
  const startFocus = usePomodoroStore((state) => state.start);
  const date = parseLocalDateKey(dateKey);
  const heading = date
    ? new Intl.DateTimeFormat(activeLocale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : dateKey;

  const dayAssignments = assignments
    .filter((assignment) => assignment.due_at && isoToDateKey(assignment.due_at) === dateKey)
    .sort((a, b) => {
      const aTime = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime || a.title.localeCompare(b.title);
    });
  const dayBlocks = timeBlocks
    .filter((block) => isoToDateKey(block.starts_at) === dateKey)
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const initialLoading =
    (assignmentsLoading || blocksLoading) &&
    dayAssignments.length === 0 &&
    dayBlocks.length === 0;
  const error = assignmentsError || blocksError;
  const timeFormatter = new Intl.DateTimeFormat(activeLocale, {
    hour: "numeric",
    minute: "2-digit",
  });

  const toggleAssignment = async (id: string, completed: boolean) => {
    const updated = await updateAssignment(id, {
      status: completed ? "upcoming" : "done",
    });
    if (!updated) toast.error(t("Something went wrong"));
  };

  const toggleBlock = async (id: string) => {
    if (!(await toggleTimeBlockCompleted(id))) {
      toast.error(t("Something went wrong"));
    }
  };

  const removeBlock = async (id: string) => {
    if (!(await deleteTimeBlock(id))) {
      toast.error(t("Something went wrong"));
    }
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby={showHeading ? "day-agenda-heading" : undefined}
      aria-label={showHeading ? undefined : t("Day agenda")}
    >
      {showHeading && (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="day-agenda-heading"
              className="truncate text-base font-semibold text-text-secondary"
            >
              {heading}
            </h2>
            {reviewDates.has(dateKey) && (
              <p className="mt-0.5 text-xs text-primary-400">
                ᚑ {t("Quiz reviewed")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onAddStudyBlock}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-radius-md border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-subtle"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {t("Add study block")}
          </button>
        </div>
      )}

      {initialLoading ? (
        <p role="status" className="px-4 py-10 text-center text-sm text-text-tertiary">
          {t("Loading...")}
        </p>
      ) : error && dayAssignments.length === 0 && dayBlocks.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-error-300">{t("Something went wrong")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-radius-md border border-border-subtle px-4 text-sm text-text-secondary hover:bg-subtle"
          >
            {t("Try again")}
          </button>
        </div>
      ) : dayAssignments.length === 0 && dayBlocks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-text-tertiary">{t("No plans for this day")}</p>
          <button
            type="button"
            onClick={onAddStudyBlock}
            className="min-h-11 rounded-radius-md border border-border-subtle px-4 text-sm font-medium text-text-secondary hover:bg-subtle"
          >
            {t("Add study block")}
          </button>
        </div>
      ) : (
        <div className="obsidian-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-radius-md border border-error-500/20 bg-error-500/10 px-3 py-2"
            >
              <span className="text-xs text-error-300">{t("Something went wrong")}</span>
              <button
                type="button"
                onClick={onRetry}
                className="min-h-9 rounded-radius-sm px-2 text-xs font-medium text-text-secondary hover:bg-subtle"
              >
                {t("Try again")}
              </button>
            </div>
          )}

          {dayBlocks.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t("Study blocks")}
              </h3>
              <div className="space-y-2">
                {dayBlocks.map((block) => (
                  <article
                    key={block.id}
                    className="glass-card rounded-radius-lg border-l-2 p-3"
                    style={{
                      borderColor: block.course_color ?? "var(--color-primary-500)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleBlock(block.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-subtle hover:text-primary-400"
                        aria-label={
                          block.completed ? t("Mark incomplete") : t("Mark complete")
                        }
                      >
                        {block.completed ? (
                          <CheckCircleSolid className="h-5 w-5 text-primary-400" />
                        ) : (
                          <CheckCircleIcon className="h-5 w-5" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1 pt-1">
                        <h4
                          className={`text-sm font-medium ${
                            block.completed
                              ? "text-text-tertiary line-through"
                              : "text-text-secondary"
                          }`}
                        >
                          {block.assignment_title || block.title || t("Study block")}
                        </h4>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {timeFormatter.format(new Date(block.starts_at))}–
                          {timeFormatter.format(new Date(block.ends_at))}
                          {block.course_name ? ` · ${block.course_name}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeBlock(block.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-error-500/10 hover:text-error-400"
                        aria-label={t("Delete study block")}
                      >
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {dayAssignments.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t("Tasks")}
              </h3>
              <div className="space-y-2">
                {dayAssignments.map((assignment) => {
                  const completed = assignment.status === "done";
                  const effectiveStatus = getEffectiveAssignmentStatus(assignment);
                  return (
                    <article
                      key={assignment.id}
                      className="glass-card rounded-radius-lg border-l-2 p-3"
                      style={{
                        borderColor:
                          assignment.course_color ?? "var(--color-primary-500)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleAssignment(assignment.id, completed)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-subtle hover:text-primary-400"
                          aria-label={completed ? t("Mark as upcoming") : t("Mark as done")}
                        >
                          {completed ? (
                            <CheckCircleSolid className="h-5 w-5 text-primary-400" />
                          ) : (
                            <CheckCircleIcon className="h-5 w-5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1 pt-1">
                          <h4
                            className={`text-sm font-medium ${
                              completed
                                ? "text-text-tertiary line-through"
                                : "text-text-secondary"
                            }`}
                          >
                            {assignment.title}
                          </h4>
                          <p className="mt-1 text-xs text-text-tertiary">
                            {assignment.due_at
                              ? timeFormatter.format(new Date(assignment.due_at))
                              : t("No due date")}
                            {assignment.course_name
                              ? ` · ${assignment.course_name}`
                              : ""}
                            {effectiveStatus === "late" ? ` · ${t("Overdue")}` : ""}
                          </p>
                        </div>
                        {!completed && (
                          <button
                            type="button"
                            onClick={() =>
                              startFocus({
                                assignmentId: assignment.id,
                                assignmentTitle: assignment.title,
                                courseName: assignment.course_name ?? undefined,
                                courseColor: assignment.course_color ?? undefined,
                              })
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-primary-500/10 hover:text-primary-400"
                            aria-label={t("Start Focus")}
                          >
                            <PlayIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
