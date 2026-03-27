"use client";

import { useEffect, useRef } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  newMilestone?: number | null;
}

export default function StreakDisplay({
  currentStreak,
  longestStreak,
  newMilestone,
}: StreakDisplayProps) {
  const { t } = useI18n();
  const confettiRef = useRef(false);

  useEffect(() => {
    if (newMilestone && !confettiRef.current) {
      confettiRef.current = true;
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      });
    }
  }, [newMilestone]);

  return (
    <div className="flex items-center gap-2 bg-ai-500/10 text-ai-400 px-3 py-1.5 rounded-lg text-sm font-semibold">
      <span className="text-base">🔥</span>
      <span>
        {t(
          currentStreak !== 1
            ? "quiz.streak.count_days"
            : "quiz.streak.count_day",
          { count: currentStreak },
        )}
      </span>
    </div>
  );
}
