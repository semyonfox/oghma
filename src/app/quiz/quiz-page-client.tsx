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
  initialData: QuizDashboardInitialData;
}) {
  const { t } = useI18n();
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);

  useEffect(() => {
    setActiveNav("quiz");
  }, [setActiveNav]);

  return (
    <div className="flex h-dvh flex-col bg-app-page text-text">
      <MobileAppHeader title={t("quiz.title")} />
      <div className="flex min-h-0 flex-1">
        <div className="desktop-navigation-rail hidden w-64 shrink-0 border-r border-border lg:block">
          <PrimaryNavigation variant="sidebar" />
        </div>
        <main className="mobile-dock-clearance min-w-0 flex-1 overflow-y-auto">
          <QuizDashboard
            initialDashboard={initialData.dashboard}
            initialCourses={initialData.courses}
          />
        </main>
      </div>
      <MobileBottomNavigation />
    </div>
  );
}
