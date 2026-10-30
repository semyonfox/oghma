"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useQuizStore from "@/lib/notes/state/quiz";
import useCourseStore from "@/lib/notes/state/courses";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  CourseVisibilityDialog,
  mergeCourseVisibilityItems,
  type CourseVisibilityItem,
} from "@/components/course-visibility/course-visibility-manager";
import StatsRow from "./stats-row";
import CourseList from "./course-list";
import { browserTimeZone, DEFAULT_TIME_ZONE } from "@/lib/quiz/time-zone";
import type {
  QuizDashboardCourse,
  QuizDashboardSummary,
  QuizSessionStartResponse,
} from "@/lib/quiz/types";

export default function QuizDashboard({
  initialDashboard,
  initialCourses,
}: {
  initialDashboard: QuizDashboardSummary;
  initialCourses: QuizDashboardCourse[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { startSession } = useQuizStore();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [courses, setCourses] = useState(initialCourses);
  const [searchQuery, setSearchQuery] = useState("");
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const skippedInitialLoad = useRef(false);

  const visibleDashboard = dashboard;
  const visibleCourses = courses;

  const {
    settings,
    showArchived,
    fetchSettings,
    toggleShowArchived,
    archiveCourse,
    unarchiveCourse,
  } = useCourseStore();

  const loadDashboard = async () => {
    const tz = encodeURIComponent(browserTimeZone());
    const res = await fetch(`/api/quiz/dashboard?tz=${tz}`);
    if (res.ok) setDashboard((await res.json()) as QuizDashboardSummary);
  };

  const loadServerData = async () => {
    const courseQuery = showArchived ? "?includeArchived=1" : "";
    const [, coursesRes] = await Promise.all([
      loadDashboard(),
      fetch("/api/quiz/dashboard/courses" + courseQuery),
    ]);

    if (coursesRes.ok) {
      const data = (await coursesRes.json()) as {
        courses: QuizDashboardCourse[];
      };
      setCourses(data.courses);
    }
  };

  const refreshCourseData = async () => {
    await Promise.all([loadServerData(), fetchSettings()]);
  };

  useEffect(() => {
    void fetchSettings().catch(() => {});
  }, [fetchSettings]);

  // reloads follow the archived filter and fresh server props, reading the
  // latest loaders through effect events
  const reloadDashboard = useEffectEvent(loadDashboard);
  const reloadServerData = useEffectEvent(loadServerData);
  useEffect(() => {
    if (!skippedInitialLoad.current) {
      skippedInitialLoad.current = true;
      if (!showArchived) {
        // the server render counted "reviewed today" in UTC
        if (browserTimeZone() !== DEFAULT_TIME_ZONE) {
          void reloadDashboard().catch(() => {});
        }
        return;
      }
    }

    void reloadServerData().catch(() => {
      // Keep the last known server data visible when refresh fails.
    });
  }, [initialCourses, initialDashboard, showArchived]);

  const visibilityItems = mergeCourseVisibilityItems(
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
    const connectionFailed = () => {
      toast.error(
        t("Could not start quiz session. Please check your connection."),
      );
      setStartingSession(null);
    };
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch("/api/quiz/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterType, filterValue }),
      }).catch(() => null);
      if (!res) {
        connectionFailed();
        return;
      }

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

      const data: QuizSessionStartResponse | null = await res
        .json()
        .catch(() => null);
      if (!data) {
        connectionFailed();
        return;
      }
      if (data.sessionId && Array.isArray(data.cardIds)) {
        startSession(data.sessionId, data.cardIds, data.question ?? null);
      }
      router.push(`/quiz/session/${data.sessionId}`);
      return;
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
            if (courseId === null) startReview("all");
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
