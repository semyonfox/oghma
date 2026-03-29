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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="bg-surface border border-border-subtle rounded-lg p-4"
        >
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider">
            {stat.label}
          </div>
          <div className="text-text text-2xl font-bold mt-1">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
