"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useQuizStore from "@/lib/notes/state/quiz";
import useCourseStore from "@/lib/notes/state/courses.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  CourseVisibilityDialog,
  mergeCourseVisibilityItems,
  type CourseVisibilityItem,
} from "@/components/course-visibility/course-visibility-manager";
import StatsRow from "./stats-row";
import CourseList from "./course-list";
import type {
  QuizDashboardCourse,
  QuizDashboardSummary,
} from "@/app/quiz/server-data";

export default function QuizDashboard({
  initialDashboard,
  initialCourses,
}: {
  initialDashboard: QuizDashboardSummary;
  initialCourses: QuizDashboardCourse[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    dashboardData,
    courses,
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
  } = useQuizStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const skippedInitialLoad = useRef(false);

  const visibleDashboard = dashboardData ?? initialDashboard;
  const visibleCourses = dashboardData ? courses : initialCourses;

  const {
    settings,
    showArchived,
    fetchSettings,
    toggleShowArchived,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();

  const loadServerData = useCallback(async () => {
    const courseQuery = showArchived ? "?includeArchived=1" : "";
    const [dashRes, coursesRes] = await Promise.all([
      fetch("/api/quiz/dashboard"),
      fetch(`/api/quiz/dashboard/courses${courseQuery}`),
    ]);

    if (dashRes.ok) setDashboard(await dashRes.json());
    if (coursesRes.ok) {
      const data = await coursesRes.json();
      setCourses(data.courses);
    }
  }, [showArchived, setCourses, setDashboard]);

  const refreshCourseData = async () => {
    await Promise.all([loadServerData(), fetchSettings()]);
  };

  useEffect(() => {
    void fetchSettings().catch(() => {});
  }, [fetchSettings]);

  useEffect(() => {
    if (!skippedInitialLoad.current) {
      skippedInitialLoad.current = true;
      setDashboard(initialDashboard);
      setCourses(initialCourses);
      setDashboardLoading(false);
      if (!showArchived) return;
    }

    async function load() {
      setDashboardLoading(true);
      try {
        await loadServerData();
      } catch {
        // network or parse error — fallback handled below
      } finally {
        if (!useQuizStore.getState().dashboardData) {
          setDashboard({
            dueCount: 0,
            totalCards: 0,
            mastery: 0,
            reviewedToday: 0,
            weekAccuracy: 0,
            currentStreak: 0,
            longestStreak: 0,
            hasContent: false,
          });
        }
        setDashboardLoading(false);
      }
    }
    void load();
  }, [
    initialCourses,
    initialDashboard,
    loadServerData,
    setCourses,
    setDashboard,
    setDashboardLoading,
    showArchived,
  ]);

  const visibilityItems = useMemo(
    () =>
      mergeCourseVisibilityItems(
        visibleCourses.map((course) => ({
          courseId: course.courseId,
          courseName: course.courseName,
          isActive: course.isActive,
          contextText:
            course.totalCards > 0
              ? t("{dueCount} due · {totalCards} cards", {
                  dueCount: course.dueCount,
                  totalCards: course.totalCards,
                })
              : t("No quiz cards yet"),
          hasDueItems: course.dueCount > 0,
        })),
        settings,
      ),
    [settings, t, visibleCourses],
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
    await refreshCourseData();
  };

  const handleArchiveNoDueCourses = async (items: CourseVisibilityItem[]) => {
    await Promise.all(
      items.map((item) => archiveCourse(item.courseId, item.courseName)),
    );
    await refreshCourseData();
  };

  const handleRestoreArchivedCourses = async (items: CourseVisibilityItem[]) => {
    await Promise.all(items.map((item) => unarchiveCourse(item.courseId)));
    await refreshCourseData();
  };

  const startReview = async (filterType: string, filterValue?: unknown) => {
    const key = filterValue != null ? String(filterValue) : "all";
    if (startingSession) return;
    setStartingSession(key);

    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("/api/quiz/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filterType, filterValue }),
        });

        if (res.status === 202) {
          // questions are being generated in the background — retry after delay
          const data = await res.json().catch(() => ({}));
          if (attempt === 1) {
            toast.info(
              t("quiz.generating_questions"),
              { duration: (data.retryAfter ?? 3) * 1000 * MAX_RETRIES },
            );
          }
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, (data.retryAfter ?? 3) * 1000),
            );
            continue;
          }
          toast.error(
            t("quiz.generating_timeout"),
          );
          setStartingSession(null);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(
            body.error || t("Could not start quiz session. Please try again."),
          );
          setStartingSession(null);
          return;
        }

        const data = await res.json();
        if (data.sessionId && Array.isArray(data.cardIds)) {
          startSession(data.sessionId, data.cardIds, data.question ?? null);
        }
        router.push(`/quiz/session/${data.sessionId}`);
        return;
      } catch {
        toast.error(
          t("Could not start quiz session. Please check your connection."),
        );
        setStartingSession(null);
        return;
      }
    }

    setStartingSession(null);
  };

  return (
    <div className="max-w-container-content mx-auto px-6 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-serif text-text text-2xl font-semibold">
            {t("quiz.title")}
          </h1>
          <p className="text-text-tertiary text-xs mt-1">
            {t("quiz.cards_due_summary", {
              dueCount: visibleDashboard.dueCount,
              totalCards: visibleDashboard.totalCards,
            })}
          </p>
        </div>
        <button
          onClick={() => startReview("all")}
          disabled={
            !!startingSession ||
            (visibleDashboard.dueCount === 0 &&
              (visibleDashboard.totalCards > 0 || !visibleDashboard.hasContent))
          }
          className="bg-primary-600 text-text-on-primary px-4 py-2 rounded-radius-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {startingSession === "all" ? t("quiz.loading") : t("Start Review")}
        </button>
      </div>

      <StatsRow
        mastery={visibleDashboard.mastery}
        dueCount={visibleDashboard.dueCount}
        reviewedToday={visibleDashboard.reviewedToday}
        weekAccuracy={visibleDashboard.weekAccuracy}
        currentStreak={visibleDashboard.currentStreak}
      />

      <div className="mt-6">
        <CourseList
          courses={visibleCourses}
          onSelectCourse={(courseId) => {
            if (courseId === 0) startReview("all");
            else startReview("course", courseId);
          }}
          allNotesStats={
            visibleDashboard.totalCards > 0
              ? {
                  totalCards: visibleDashboard.totalCards,
                  dueCount: visibleDashboard.dueCount,
                  mastery: visibleDashboard.mastery,
                }
              : null
          }
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loadingCourseId={startingSession}
          showArchived={showArchived}
          onToggleArchived={toggleShowArchived}
          onOpenManager={() => setManagerOpen(true)}
        />
      </div>

      <CourseVisibilityDialog
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        items={visibilityItems}
        onToggleCourse={handleSetCourseVisibility}
        onArchiveAllNoDue={handleArchiveNoDueCourses}
        onRestoreAll={handleRestoreArchivedCourses}
      />
    </div>
  );
}
