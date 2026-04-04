"use client";

import IconNav from "@/components/sidebar/icon-nav";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import { useEffect } from "react";
import QuizDashboard from "@/components/quiz/dashboard";

export default function QuizPage() {
  const { setActiveNav } = useLayoutStore();

  useEffect(() => {
    setActiveNav("quiz");
  }, [setActiveNav]);

  return (
    <div className="flex h-screen bg-background text-text">
      <IconNav />
      <div className="flex-1 overflow-y-auto">
        <QuizDashboard />
      </div>
    </div>
  );
}
