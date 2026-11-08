"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface StatsRowProps {
  mastery: number;
  dueCount: number;
  reviewedToday: number;
  weekAccuracy: number;
  currentStreak?: number;
}

export default function StatsRow({
  mastery,
  dueCount,
  reviewedToday,
  weekAccuracy,
  currentStreak,
}: StatsRowProps) {
  const { t } = useI18n();
  const statCards = [
    { label: t("quiz.stats.overall_mastery"), value: `${mastery}%` },
    { label: t("quiz.stats.due_today"), value: String(dueCount) },
    { label: t("quiz.stats.reviewed_today"), value: String(reviewedToday) },
    { label: t("quiz.stats.accuracy_7d"), value: `${weekAccuracy}%` },
  ];

  if (currentStreak !== undefined) {
    statCards.push({
      label: t("quiz.stats.day_streak"),
      value: `ᚑ ${currentStreak}`,
    });
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="min-w-0 rounded-radius-xl border border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3.5"
        >
          <div className="truncate text-[11px] text-text-tertiary sm:text-xs">{stat.label}</div>
          <div className="mt-1 font-serif text-xl font-bold leading-tight sm:text-[28px] tabular-nums text-text">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
