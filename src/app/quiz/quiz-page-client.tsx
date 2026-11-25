"use client";

import { useEffect } from "react";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileBottomNavigation from "@/components/navigation/mobile-bottom-navigation";
import QuizDashboard from "@/components/quiz/quiz-dashboard";
import useLayoutStore from "@/lib/notes/state/layout";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { QuizDashboardInitialData } from "./server-data";

export default function QuizPageClient({
  initialData,
}: {
  initialData: QuizDashboardInitialData | null;
}) {
  const { t } = useI18n();
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);

  useEffect(() => {
    setActiveNav("quiz");
  }, [setActiveNav]);

  return (
    <div className="flex h-app flex-col bg-app-page text-text">
      <MobileAppHeader
        title={t("quiz.title")}
        subtitle={initialData
          ? t("quiz.cards_due_summary", {
              dueCount: initialData.dashboard.dueCount,
              totalCards: initialData.dashboard.totalCards,
            })
          : <span aria-hidden="true" className="skeleton block h-3 w-24 rounded-radius-sm" />}
      />
      <div className="flex min-h-0 flex-1">
        <div className="desktop-navigation-rail hidden w-64 shrink-0 border-r border-border lg:block">
          <PrimaryNavigation variant="sidebar" />
        </div>
        <main className="mobile-dock-clearance min-w-0 flex-1 overflow-y-auto">
          {initialData ? (
            <QuizDashboard
              initialDashboard={initialData.dashboard}
              initialCourses={initialData.courses}
            />
          ) : (
            <div role="status" aria-label={t("Loading...")} className="max-w-container-content mx-auto px-4 py-5 sm:px-6 sm:py-8">
              <div aria-hidden="true" className="mb-4 flex justify-between sm:mb-6">
                <div className="hidden space-y-2 lg:block">
                  <div className="skeleton h-8 w-24 rounded-radius-sm" />
                  <div className="skeleton h-3 w-32 rounded-radius-sm" />
                </div>
                <div className="skeleton h-12 w-full rounded-radius-lg lg:h-11 lg:w-36" />
              </div>
              <div aria-hidden="true" className="mb-6 rounded-radius-xl border border-border bg-surface p-4">
                <div className="skeleton mb-2 h-5 w-36 rounded-radius-sm" />
                <div className="skeleton h-3 w-3/4 max-w-[70ch] rounded-radius-sm" />
              </div>
              <div aria-hidden="true" className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
                {[0, 1, 2, 3, 4].map((card) => (
                  <div key={card} className="rounded-radius-xl border border-border bg-surface p-3 sm:p-4">
                    <div className="skeleton mb-2 h-3 w-4/5 rounded-radius-sm" />
                    <div className="skeleton h-6 w-2/5 rounded-radius-sm" />
                  </div>
                ))}
              </div>
              <div aria-hidden="true" className="mt-6 space-y-3 rounded-radius-xl border border-border bg-surface p-4">
                <div className="skeleton h-4 w-20 rounded-radius-sm" />
                <div className="skeleton h-9 w-full rounded-radius-md" />
              </div>
            </div>
          )}
        </main>
      </div>
      <MobileBottomNavigation />
    </div>
  );
}
