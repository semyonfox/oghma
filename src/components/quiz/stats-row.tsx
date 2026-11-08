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
          className="rounded-radius-xl border border-border bg-surface px-4 py-3.5"
        >
          <div className="text-xs text-text-tertiary">{stat.label}</div>
          <div className="mt-1 font-sans text-2xl font-semibold tabular-nums text-text">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
