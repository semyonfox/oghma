"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface Course {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isActive?: boolean;
}

interface CourseListProps {
  courses: Course[];
  onSelectCourse: (courseId: number) => void;
  allNotesStats?: {
    totalCards: number;
    dueCount: number;
    mastery: number;
  } | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loadingCourseId?: number | string | null;
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

  return (
    <div
      className={`glass-card-interactive rounded-radius-lg p-3 flex items-center gap-3 transition-colors text-left w-full ${disabled || nothingDue ? "opacity-60" : ""}`}
    >
      <button
        onClick={onClick}
        disabled={disabled || nothingDue}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-text text-sm font-medium truncate">
          {courseName}
        </div>
        <div className="flex gap-3 mt-1 text-xs">
          {isArchived && (
            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-tertiary">
              {t("Archived")}
            </span>
          )}
          {hasCards ? (
            <>
              <span className="text-text-tertiary">
                {nothingDue
                  ? t("quiz.courses.all_scheduled")
                  : t("quiz.courses.due_count", { count: dueCount })}
              </span>
              <span className="text-text-tertiary">
                {t("quiz.courses.total_count", { count: totalCards })}
              </span>
            </>
          ) : (
            <span className="text-text-tertiary italic">
              {isLoading
                ? t("quiz.loading")
                : t("quiz.courses.generate_prompt")}
            </span>
          )}
        </div>
      </button>
      <div className="text-right flex-shrink-0 flex items-center gap-2">
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
        ) : hasCards ? (
          <div>
            <div className="text-text-secondary text-sm font-medium">
              {mastery}%
            </div>
            <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
              <div
                className="h-full rounded-full bg-text-tertiary"
                style={{ width: `${mastery}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-text-tertiary text-xs">→</div>
        )}
      </div>
    </div>
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
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-text font-semibold text-sm">{t("Courses")}</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("quiz.courses.search_placeholder")}
            className="bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 w-48"
          />
          <button
            type="button"
            onClick={onOpenManager}
            className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.07]"
          >
            {t("Manage")}
          </button>
        </div>
      </div>

      {/* show archived toggle */}
      {hasArchived && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={onToggleArchived}
            className="rounded border-border-subtle text-primary-500 focus:ring-primary-500/50"
          />
          <span className="text-text-secondary text-sm">
            {t("quiz.courses.show_archived")}
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2">
        {/* "All My Notes" synthetic entry — always visible regardless of search */}
        {allNotesStats && (
          <CourseButton
            courseName={t("quiz.courses.all_notes")}
            totalCards={allNotesStats.totalCards}
            dueCount={allNotesStats.dueCount}
            mastery={allNotesStats.mastery}
            isLoading={loadingCourseId === "all"}
            disabled={anyLoading}
            onClick={() => onSelectCourse(0)}
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
            isLoading={
              loadingCourseId === course.courseId ||
              loadingCourseId === String(course.courseId)
            }
            disabled={anyLoading}
            isArchived={false}
            onClick={() => onSelectCourse(course.courseId)}
          />
        ))}

        {/* Archived courses section */}
        {showArchived && filteredArchived.length > 0 && (
          <>
            <div className="pt-2 mt-2 border-t border-border-subtle">
              <span className="text-text-tertiary text-xs uppercase tracking-wider">
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
                isLoading={
                  loadingCourseId === course.courseId ||
                  loadingCourseId === String(course.courseId)
                }
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
