"use client";

import {
  CanvasAvailabilityBadge,
  ChevronDownIcon,
  CourseBadge,
} from "./canvas-helpers";
import type { Dispatch, SetStateAction } from "react";

type Course = {
  id: string | number;
  name: string;
  course_code?: string;
  historical?: boolean;
  modules?: unknown[];
  canvasStatus?: string;
  canvasStatusReason?: string;
};
type Translate = (key: string, params?: Record<string, unknown>) => string;

export default function CanvasCourseSelector({
  courses,
  selectedCourseIds,
  onToggleCourse,
  onToggleSelectAll,
  getCourseStatus,
  courseListOpen,
  setCourseListOpen,
  t,
}: {
  courses: Course[];
  selectedCourseIds: string[];
  onToggleCourse: (id: string | number) => void;
  onToggleSelectAll: () => void;
  getCourseStatus: (id: string | number) => { status: "synced" | "outOfSync" | "syncing" | "checking" | "forbidden" | "error" | "idle"; error?: string | null };
  courseListOpen: boolean;
  setCourseListOpen: Dispatch<SetStateAction<boolean>>;
  t: Translate;
}) {
  const importableCourses = courses.filter(
    (course) =>
      course.canvasStatus !== "inaccessible" &&
      course.canvasStatus !== "unavailable",
  );
  const selectedImportableCount = importableCourses.filter((course) =>
    selectedCourseIds.includes(String(course.id)),
  ).length;
  const allSelected =
    importableCourses.length > 0 &&
    selectedImportableCount === importableCourses.length;

  return (
    <div className="glass-card rounded-radius-md">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <h3 className="text-sm font-medium text-text-secondary">
          <button
            type="button"
            aria-expanded={courseListOpen}
            onClick={() => setCourseListOpen(!courseListOpen)}
            className="flex items-center gap-2 hover:text-text"
          >
            {t("Courses")}
            <ChevronDownIcon
              className="size-4 text-text-tertiary"
              open={courseListOpen}
            />
          </button>
        </h3>
        {importableCourses.length > 0 && (
          <span className="text-xs text-text-tertiary" aria-live="polite">
            {t("{selected} of {total} available courses selected", {
              selected: selectedImportableCount,
              total: importableCourses.length,
            })}
          </span>
        )}
        {courseListOpen && importableCourses.length > 0 && (
          <button
            type="button"
            onClick={onToggleSelectAll}
            className="ml-auto rounded-radius-sm px-1 py-0.5 text-xs font-medium text-primary-400 hover:text-primary-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
          >
            {allSelected ? t("Deselect all") : t("Select all")}
          </button>
        )}
      </header>

      {courseListOpen && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-subtle">
          <div
            id="canvas-course-list"
            role="region"
            aria-label={t("Course list")}
            tabIndex={courses.length > 5 ? 0 : undefined}
            className="obsidian-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
          >
            {courses.map((course) => {
              const { status, error } = getCourseStatus(course.id);
              const unavailable = ["inaccessible", "unavailable"].includes(
                course.canvasStatus ?? "",
              );
              const reasonId = `canvas-course-${course.id}-availability-reason`;
              return (
                <label
                  key={course.id}
                  className={`flex items-start gap-3 ${
                    unavailable ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={
                      !unavailable && selectedCourseIds.includes(String(course.id))
                    }
                    disabled={unavailable}
                    aria-describedby={unavailable ? reasonId : undefined}
                    onChange={() => {
                      if (!unavailable) onToggleCourse(course.id);
                    }}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-secondary">
                        {course.name}
                      </p>
                      <CanvasAvailabilityBadge
                        status={course.canvasStatus}
                        reasonCode={course.canvasStatusReason}
                        describedBy={unavailable ? reasonId : undefined}
                        t={t}
                      />
                      {course.historical && !course.canvasStatus && (
                        <span className="text-xs text-text-tertiary">
                          {t("Previous course")}
                        </span>
                      )}
                      <CourseBadge status={status} errorMsg={error ?? undefined} t={t} />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {course.course_code}
                    </p>
                    {unavailable && (
                      <p id={reasonId} className="text-xs text-text-tertiary">
                        {course.canvasStatus === "unavailable"
                          ? t("Canvas could not confirm access to this course. Try again later.")
                          : t("This course is no longer available in Canvas.")}
                      </p>
                    )}
                    {(course.modules?.length ?? 0) > 0 && (
                      <p className="text-xs text-text-tertiary">
                        {course.modules?.length ?? 0}{" "}
                        {(course.modules?.length ?? 0) !== 1
                          ? t("modules")
                          : t("module")}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          {courses.length > 5 && (
            <p className="text-xs text-text-tertiary">
              {t("Scroll to see more courses")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
