"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
import StatsRow from "./stats-row";
import CourseList from "./course-list";

export default function QuizDashboard() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    dashboardData,
    courses,
    dashboardLoading,
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
  } = useQuizStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [startingSession, setStartingSession] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setDashboardLoading(true);
      try {
        const [dashRes, coursesRes] = await Promise.all([
          fetch("/api/quiz/dashboard"),
          fetch("/api/quiz/dashboard/courses"),
        ]);
        if (dashRes.ok) setDashboard(await dashRes.json());
        if (coursesRes.ok) {
          const data = await coursesRes.json();
          setCourses(data.courses);
        }
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
    load();
  }, [setDashboard, setCourses, setDashboardLoading]);

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
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, (data.retryAfter ?? 3) * 1000),
            );
            continue;
          }
          toast.error(
            "Questions are still being generated. Please try again in a moment.",
          );
          setStartingSession(null);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(
            body.error || "Could not start quiz session. Please try again.",
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
          "Could not start quiz session. Please check your connection.",
        );
        setStartingSession(null);
        return;
      }
    }

    setStartingSession(null);
  };

  if (dashboardLoading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-tertiary text-sm">{t("quiz.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-container-content mx-auto px-6 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-serif text-text text-2xl font-semibold">
            {t("quiz.title")}
          </h1>
          <p className="text-text-tertiary text-xs mt-1">
            {t("quiz.cards_due_summary", {
              dueCount: dashboardData.dueCount,
              totalCards: dashboardData.totalCards,
            })}
          </p>
        </div>
        <button
          onClick={() => startReview("all")}
          disabled={
            !!startingSession ||
            (dashboardData.dueCount === 0 &&
              (dashboardData.totalCards > 0 || !dashboardData.hasContent))
          }
          className="bg-secondary-500 text-white px-4 py-2 rounded-radius-lg text-sm font-semibold hover:bg-secondary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {startingSession === "all" ? t("quiz.loading") : t("Start Review")}
        </button>
      </div>

      <StatsRow
        mastery={dashboardData.mastery}
        dueCount={dashboardData.dueCount}
        reviewedToday={dashboardData.reviewedToday}
        weekAccuracy={dashboardData.weekAccuracy}
        currentStreak={dashboardData.currentStreak}
      />

      <div className="mt-6">
        <CourseList
          courses={courses}
          onSelectCourse={(courseId) => {
            if (courseId === 0) startReview("all");
            else startReview("course", courseId);
          }}
          allNotesStats={
            dashboardData.totalCards > 0
              ? {
                  totalCards: dashboardData.totalCards,
                  dueCount: dashboardData.dueCount,
                  mastery: dashboardData.mastery,
                }
              : null
          }
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loadingCourseId={startingSession}
        />
      </div>
    </div>
  );
}
