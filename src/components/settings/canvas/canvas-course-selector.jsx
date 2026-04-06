"use client";

import { ChevronDownIcon, CourseBadge } from "./canvas-helpers";

export default function CanvasCourseSelector({
  courses,
  selectedCourseIds,
  onToggleCourse,
  onToggleSelectAll,
  getCourseStatus,
  courseListOpen,
  setCourseListOpen,
  t,
}) {
  const allSelected =
    courses.length > 0 && selectedCourseIds.length === courses.length;

  return (
    <div className="glass-card rounded-radius-md">
      <button
        type="button"
        onClick={() => setCourseListOpen(!courseListOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.07] transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-secondary">
            {t("Courses")}
          </h3>
          {selectedCourseIds.length > 0 && (
            <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
              {selectedCourseIds.length} {t("selected")}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className="size-4 text-text-tertiary"
          open={courseListOpen}
        />
      </button>

      {courseListOpen && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-white/2.5">
          {courses.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onToggleSelectAll}
                className="text-xs text-primary-400 hover:text-primary-300 font-medium"
              >
                {allSelected ? t("Deselect all") : t("Select all")}
              </button>
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {courses.map((course) => {
              const { status, error } = getCourseStatus(course.id);
              return (
                <label
                  key={course.id}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCourseIds.includes(course.id)}
                    onChange={() => onToggleCourse(course.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-secondary">
                        {course.name}
                      </p>
                      <CourseBadge status={status} errorMsg={error} />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {course.course_code}
                    </p>
                    {course.modules?.length > 0 && (
                      <p className="text-xs text-text-tertiary">
                        {course.modules.length}{" "}
                        {course.modules.length !== 1
                          ? t("modules")
                          : t("module")}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
