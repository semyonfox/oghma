"use client";

import { useEffect } from "react";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import QuizDashboard from "@/components/quiz/dashboard";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import type { QuizDashboardInitialData } from "./server-data";

export default function QuizPageClient({
  initialData,
}: {
  initialData: QuizDashboardInitialData;
}) {
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);

  useEffect(() => {
    setActiveNav("quiz");
  }, [setActiveNav]);

  return (
    <div className="flex h-screen bg-app-page text-text">
      <PrimaryNavigation />
      <div className="flex-1 overflow-y-auto">
        <QuizDashboard
          initialDashboard={initialData.dashboard}
          initialCourses={initialData.courses}
        />
      </div>
    </div>
  );
}
