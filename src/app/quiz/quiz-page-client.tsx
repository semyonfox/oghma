"use client";

import { useEffect } from "react";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import QuizDashboard from "@/components/quiz/quiz-dashboard";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { QuizDashboardInitialData } from "./server-data";

export default function QuizPageClient({
  initialData,
}: {
  initialData: QuizDashboardInitialData;
}) {
  const { t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);

  useEffect(() => {
    setActiveNav("quiz");
  }, [setActiveNav]);

  return (
    <div className="flex h-dvh flex-col bg-app-page text-text">
      <MobileAppHeader title={t("quiz.title")} />
      <div className="flex min-h-0 flex-1">
        {isDesktop === true && (
          <div className="w-12 shrink-0 overflow-hidden border-r border-border-subtle bg-background">
            <PrimaryNavigation />
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <QuizDashboard
            initialDashboard={initialData.dashboard}
            initialCourses={initialData.courses}
          />
        </main>
      </div>
    </div>
  );
}
