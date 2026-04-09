"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface Course {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
}

interface CourseListProps {
  courses: Course[];
  onSelectCourse: (courseId: number) => void;
  allNotesStats?: { totalCards: number; dueCount: number; mastery: number } | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loadingCourseId?: string | null;
}

function CourseButton({
  courseName,
  totalCards,
  dueCount,
  mastery,
  isLoading,
  disabled,
  onClick,
}: {
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const hasCards = totalCards > 0;
  const nothingDue = hasCards && dueCount === 0;

  return (
    <button
      onClick={onClick}
      disabled={disabled || nothingDue}
      className="glass-card-interactive rounded-radius-lg p-3 flex items-center gap-3 transition-colors text-left w-full disabled:cursor-not-allowed"
    >
      <div className="flex-1 min-w-0">
        <div className="text-text text-sm font-medium truncate">{courseName}</div>
        <div className="flex gap-3 mt-1 text-xs">
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
              {isLoading ? t("quiz.loading") : t("quiz.courses.generate_prompt")}
            </span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
        ) : hasCards ? (
          <>
            <div className="text-text-secondary text-sm font-medium">{mastery}%</div>
            <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
              <div
                className="h-full rounded-full bg-text-tertiary"
                style={{ width: `${mastery}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-text-tertiary text-xs">→</div>
        )}
      </div>
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
}: CourseListProps) {
  const { t } = useI18n();
  const anyLoading = !!loadingCourseId;

  const filtered = courses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-text font-semibold text-sm">{t("Courses")}</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("quiz.courses.search_placeholder")}
          className="bg-surface border border-border-subtle rounded-radius-md px-3 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 w-48"
        />
      </div>
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

        {filtered.map((course) => {
          const isLoading = loadingCourseId === String(course.courseId);
          const hasCards = course.totalCards > 0;
          const nothingDue = hasCards && course.dueCount === 0;
          return (
            <button
              key={course.courseId}
              onClick={() => onSelectCourse(course.courseId)}
              disabled={anyLoading || nothingDue}
              className="glass-card-interactive rounded-radius-lg p-3 flex items-center gap-3 transition-colors text-left w-full disabled:cursor-not-allowed"
            >
              <div className="flex-1 min-w-0">
                <div className="text-text text-sm font-medium truncate">
                  {course.courseName}
                </div>
                <div className="flex gap-3 mt-1 text-xs">
                  {hasCards ? (
                    <>
                      <span className="text-text-tertiary">
                        {nothingDue
                          ? t("quiz.courses.all_scheduled")
                          : t("quiz.courses.due_count", { count: course.dueCount })}
                      </span>
                      <span className="text-text-tertiary">
                        {t("quiz.courses.total_count", { count: course.totalCards })}
                      </span>
                    </>
                  ) : (
                    <span className="text-text-tertiary italic">
                      {isLoading ? t("quiz.loading") : t("quiz.courses.generate_prompt")}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
                ) : hasCards ? (
                  <>
                    <div className="text-text-secondary text-sm font-medium">
                      {course.mastery}%
                    </div>
                    <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
                      <div
                        className="h-full rounded-full bg-text-tertiary"
                        style={{ width: `${course.mastery}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-text-tertiary text-xs">→</div>
                )}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && !allNotesStats && (
          <div className="text-text-tertiary text-sm text-center py-8">
            {courses.length === 0
              ? t("quiz.courses.no_content")
              : t("quiz.courses.no_matches")}
          </div>
        )}
        {filtered.length === 0 && allNotesStats && searchQuery && (
          <div className="text-text-tertiary text-sm text-center py-4">
            {t("quiz.courses.no_matches")}
          </div>
        )}
      </div>
    </div>
  );
}
