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
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function CourseList({
  courses,
  onSelectCourse,
  searchQuery,
  onSearchChange,
}: CourseListProps) {
  const { t } = useI18n();
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
        {filtered.map((course) => (
          <button
            key={course.courseId}
            onClick={() => onSelectCourse(course.courseId)}
            className="glass-card-interactive rounded-radius-lg p-3 flex items-center gap-3 transition-colors text-left w-full"
          >
            <div className="flex-1 min-w-0">
              <div className="text-text text-sm font-medium truncate">
                {course.courseName}
              </div>
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-text-tertiary">
                  {t("quiz.courses.due_count", { count: course.dueCount })}
                </span>
                <span className="text-text-tertiary">
                  {t("quiz.courses.total_count", { count: course.totalCards })}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-text-secondary text-sm font-medium">
                {course.mastery}%
              </div>
              <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
                <div
                  className="h-full rounded-full bg-text-tertiary"
                  style={{ width: `${course.mastery}%` }}
                />
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-text-tertiary text-sm text-center py-8">
            {courses.length === 0
              ? t("quiz.courses.no_content")
              : t("quiz.courses.no_matches")}
          </div>
        )}
      </div>
    </div>
  );
}
