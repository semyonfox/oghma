"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
import StatsRow from "./stats-row";
import CourseList from "./course-list";
import StreakDisplay from "./streak-display";

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
  } = useQuizStore();
  const [searchQuery, setSearchQuery] = useState("");

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
        // if dashboardData was never set (API failed), provide defaults
        if (!useQuizStore.getState().dashboardData) {
          setDashboard({
            dueCount: 0,
            totalCards: 0,
            mastery: 0,
            reviewedToday: 0,
            weekAccuracy: 0,
            currentStreak: 0,
            longestStreak: 0,
          });
        }
        setDashboardLoading(false);
      }
    }
    load();
  }, [setDashboard, setCourses, setDashboardLoading]);

  const startReview = async (filterType: string, filterValue?: unknown) => {
    const res = await fetch("/api/quiz/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filterType, filterValue }),
    });
    if (!res.ok) return;
    const data = await res.json();
    router.push(`/quiz/session/${data.sessionId}`);
  };

  if (dashboardLoading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-tertiary text-sm">{t("quiz.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-text text-xl font-bold">{t("quiz.title")}</h1>
          <p className="text-text-tertiary text-xs mt-1">
            {t("quiz.cards_due_summary", {
              dueCount: dashboardData.dueCount,
              totalCards: dashboardData.totalCards,
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StreakDisplay
            currentStreak={dashboardData.currentStreak}
            longestStreak={dashboardData.longestStreak}
          />
          <button
            onClick={() => startReview("all")}
            disabled={dashboardData.dueCount === 0}
            className="bg-secondary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("Start Review")}
          </button>
        </div>
      </div>

      <StatsRow
        mastery={dashboardData.mastery}
        dueCount={dashboardData.dueCount}
        reviewedToday={dashboardData.reviewedToday}
        weekAccuracy={dashboardData.weekAccuracy}
      />

      <div className="mt-6">
        <CourseList
          courses={courses}
          onSelectCourse={(courseId) => startReview("course", courseId)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>
    </div>
  );
}
