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
      <button
        type="button"
        onClick={() => setCourseListOpen(!courseListOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-subtle transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-secondary">
            {t("Courses")}
          </h3>
          {selectedImportableCount > 0 && (
            <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
              {selectedImportableCount} {t("selected")}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className="size-4 text-text-tertiary"
          open={courseListOpen}
        />
      </button>

      {courseListOpen && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-subtle">
          {importableCourses.length > 0 && (
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
        </div>
      )}
    </div>
  );
}
