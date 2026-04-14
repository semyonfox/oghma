"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import IconNav from "@/components/sidebar/icon-nav";
import CourseVisibilityManager, {
  mergeCourseVisibilityItems,
  type CourseVisibilityItem,
  type CourseVisibilityItemSource,
} from "@/components/course-visibility/manager";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useCourseStore from "@/lib/notes/state/courses.zustand";

interface QuizCourseResponse {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  isActive?: boolean;
}

function mapQuizCourses(courses: QuizCourseResponse[]): CourseVisibilityItemSource[] {
  return courses.map((course) => ({
    courseId: course.courseId,
    courseName: course.courseName,
    isActive: course.isActive,
    contextText:
      course.totalCards > 0
        ? `${course.dueCount} due · ${course.totalCards} cards`
        : "No quiz cards yet",
    hasDueItems: course.dueCount > 0,
  }));
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { setActiveNav } = useLayoutStore();
  const {
    settings,
    fetchSettings,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();
  const [quizCourses, setQuizCourses] = useState<CourseVisibilityItemSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveNav("settings");
  }, [setActiveNav]);

  const loadSettingsPage = useCallback(async () => {
    const [coursesRes] = await Promise.all([
      fetch("/api/quiz/dashboard/courses?includeArchived=1"),
      fetchSettings(),
    ]);

    if (!coursesRes.ok) throw new Error("courses failed");

    const data = await coursesRes.json();
    setQuizCourses(mapQuizCourses(data.courses as QuizCourseResponse[]));
  }, [fetchSettings]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await loadSettingsPage();
      } catch {
        toast.error(t("Could not load course visibility settings."));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadSettingsPage, t]);

  const items = useMemo(
    () => mergeCourseVisibilityItems(quizCourses, settings),
    [quizCourses, settings],
  );

  const handleSetCourseVisibility = async (
    item: CourseVisibilityItem,
    nextActive: boolean,
  ) => {
    if (nextActive) {
      await unarchiveCourse(item.courseId);
    } else {
      await archiveCourse(item.courseId, item.courseName);
    }
    await loadSettingsPage();
  };

  const handleRestoreArchivedCourses = async (itemsToRestore: CourseVisibilityItem[]) => {
    await Promise.all(itemsToRestore.map((item) => unarchiveCourse(item.courseId)));
    await loadSettingsPage();
  };

  return (
    <div className="flex h-screen bg-app-page text-text">
      <IconNav />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <header className="mb-8">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-text-tertiary">
              {t("Settings")}
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-text-secondary">
              {t("Course visibility")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-tertiary">
              {t("Keep archived courses out of daily counts by default, then restore them here whenever you need to look back.")}
            </p>
          </header>

          <section
            id="course-visibility"
            className="rounded-radius-lg border border-border-subtle bg-surface/40 p-5"
          >
            {loading ? (
              <div className="text-sm text-text-tertiary">{t("Loading...")}</div>
            ) : (
              <CourseVisibilityManager
                inline
                items={items}
                onToggleCourse={handleSetCourseVisibility}
                onRestoreAll={handleRestoreArchivedCourses}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
