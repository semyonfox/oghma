"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";
import { splitModuleCode } from "@/lib/notes/module-code";

interface Course {
  courseId: string;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isActive?: boolean;
}

interface CourseListProps {
  courses: Course[];
  onSelectCourse: (courseId: string | null) => void;
  allNotesStats?: {
    totalCards: number;
    dueCount: number;
    mastery: number;
  } | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loadingCourseId?: string | null;
  showArchived: boolean;
  onToggleArchived: () => void;
  onOpenManager: () => void;
}

function CourseButton({
  courseName,
  totalCards,
  dueCount,
  mastery,
  isLoading,
  disabled,
  isArchived,
  onClick,
}: {
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isLoading: boolean;
  disabled: boolean;
  isArchived?: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const hasCards = totalCards > 0;
  const nothingDue = hasCards && dueCount === 0;
  const { code, title } = splitModuleCode(courseName);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || nothingDue}
      className={`group flex min-h-11 w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent sm:gap-4 sm:px-5 ${disabled || nothingDue ? "opacity-60" : ""}`}
    >
      <span className="hidden w-16 shrink-0 truncate font-mono text-xs text-text-tertiary sm:block">
        {code ?? ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`truncate text-sm ${isArchived ? "text-text-secondary" : "font-medium text-text"}`}
          >
            {title}
          </span>
          {isArchived && (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-tertiary">
              {t("Archived")}
            </span>
          )}
        </span>
        {code && (
          <span className="mt-0.5 block font-mono text-xs text-text-tertiary sm:hidden">
            {code}
          </span>
        )}
      </span>
      {hasCards ? (
        <span className="hidden w-40 shrink-0 items-center gap-2 md:flex">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle-hover">
            <span
              className={`block h-full rounded-full ${isArchived ? "bg-border-strong" : "bg-success-600"}`}
              style={{ width: `${mastery}%` }}
            />
          </span>
          <span className="w-9 text-right font-mono text-xs text-text-tertiary">
            {mastery}%
          </span>
        </span>
      ) : (
        <span className="hidden w-40 shrink-0 md:block" />
      )}
      <span className="flex shrink-0 items-center gap-2 text-xs sm:w-44">
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-tertiary border-t-transparent" />
        ) : hasCards ? (
          <>
            {nothingDue ? (
              <span className="text-text-tertiary">
                {t("quiz.courses.all_scheduled")}
              </span>
            ) : (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-soft-text">
                {t("quiz.courses.due_count", { count: dueCount })}
              </span>
            )}
            <span className="hidden font-mono text-text-tertiary sm:inline">
              {t("quiz.courses.total_count", { count: totalCards })}
            </span>
          </>
        ) : (
          <span className="font-medium text-accent group-hover:text-accent-hover">
            {t("quiz.courses.generate_prompt")}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className="hidden shrink-0 rounded-radius-md border border-border px-3 py-1 text-xs font-medium text-text transition-colors group-hover:bg-subtle-hover sm:inline"
      >
        {t("Review")}
      </span>
      <span aria-hidden="true" className="shrink-0 text-text-tertiary sm:hidden">
        →
      </span>
    </button>
  );
}

export default function CourseList({
  courses,
  onSelectCourse,
  allNotesStats,
  searchQuery,
  onSearchChange,
  loadingCourseId,
  showArchived,
  onToggleArchived,
  onOpenManager,
}: CourseListProps) {
  const { t } = useI18n();
  const anyLoading = !!loadingCourseId;

  // split courses into active and archived
  const activeCourses = courses.filter((c) => c.isActive !== false);
  const archivedCourses = courses.filter((c) => c.isActive === false);

  const filteredActive = activeCourses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredArchived = archivedCourses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const hasArchived = archivedCourses.length > 0;

  return (
    <div className="overflow-hidden rounded-radius-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-text">{t("Courses")}</h2>
          {/* show archived toggle */}
          {hasArchived && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={onToggleArchived}
                className="rounded border-border-strong accent-accent focus:ring-accent/50"
              />
              <span className="text-sm text-text-secondary">
                {t("quiz.courses.show_archived")}
              </span>
            </label>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("quiz.courses.search_placeholder")}
            className="min-w-0 flex-1 rounded-radius-md border border-border bg-input px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 sm:w-56 sm:flex-none"
          />
          <button
            type="button"
            onClick={onOpenManager}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-subtle"
          >
            {t("Manage")}
          </button>
        </div>
      </div>

      <div className="flex flex-col">
        <div
          aria-hidden="true"
          className="hidden items-center gap-4 border-b border-border-subtle px-5 py-2 text-xs text-text-tertiary md:flex"
        >
          <span className="w-16 shrink-0">{t("Code")}</span>
          <span className="flex-1">{t("Course")}</span>
          <span className="w-40 shrink-0">{t("Mastery")}</span>
          <span className="w-44 shrink-0">{t("Due · total")}</span>
          <span className="w-[66px] shrink-0" />
        </div>
        {/* "All My Notes" synthetic entry — always visible regardless of search */}
        {allNotesStats && (
          <CourseButton
            courseName={t("quiz.courses.all_notes")}
            totalCards={allNotesStats.totalCards}
            dueCount={allNotesStats.dueCount}
            mastery={allNotesStats.mastery}
            isLoading={loadingCourseId === "all"}
            disabled={anyLoading}
            onClick={() => onSelectCourse(null)}
          />
        )}

        {/* Active courses */}
        {filteredActive.map((course) => (
          <CourseButton
            key={course.courseId}
            courseName={course.courseName}
            totalCards={course.totalCards}
            dueCount={course.dueCount}
            mastery={course.mastery}
            isLoading={loadingCourseId === course.courseId}
            disabled={anyLoading}
            isArchived={false}
            onClick={() => onSelectCourse(course.courseId)}
          />
        ))}

        {/* Archived courses section */}
        {showArchived && filteredArchived.length > 0 && (
          <>
            <div className="border-b border-border-subtle px-4 pb-2 pt-4 sm:px-5">
              <span className="text-xs uppercase tracking-wider text-text-tertiary">
                {t("quiz.courses.archived")}
              </span>
            </div>
            {filteredArchived.map((course) => (
              <CourseButton
                key={course.courseId}
                courseName={course.courseName}
                totalCards={course.totalCards}
                dueCount={course.dueCount}
                mastery={course.mastery}
                isLoading={loadingCourseId === course.courseId}
                disabled={true}
                isArchived={true}
                onClick={() => onSelectCourse(course.courseId)}
              />
            ))}
          </>
        )}

        {filteredActive.length === 0 &&
          filteredArchived.length === 0 &&
          !allNotesStats && (
            <div className="text-text-tertiary text-sm text-center py-8">
              {courses.length === 0
                ? t("quiz.courses.no_content")
                : t("quiz.courses.no_matches")}
            </div>
          )}
        {filteredActive.length === 0 &&
          filteredArchived.length === 0 &&
          allNotesStats &&
          searchQuery && (
            <div className="text-text-tertiary text-sm text-center py-4">
              {t("quiz.courses.no_matches")}
            </div>
          )}
      </div>
    </div>
  );
}
