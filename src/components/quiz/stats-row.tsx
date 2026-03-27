"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface StatsRowProps {
  mastery: number;
  dueCount: number;
  reviewedToday: number;
  weekAccuracy: number;
}

export default function StatsRow({
  mastery,
  dueCount,
  reviewedToday,
  weekAccuracy,
}: StatsRowProps) {
  const { t } = useI18n();
  const statCards = [
    {
      label: t("quiz.stats.overall_mastery"),
      value: `${mastery}%`,
      color:
        mastery > 75
          ? "text-success-400"
          : mastery > 50
            ? "text-ai-400"
            : "text-error-400",
    },
    {
      label: t("quiz.stats.due_today"),
      value: String(dueCount),
      color: "text-primary-400",
    },
    {
      label: t("quiz.stats.reviewed_today"),
      value: String(reviewedToday),
      color: "text-secondary-400",
    },
    {
      label: t("quiz.stats.accuracy_7d"),
      value: `${weekAccuracy}%`,
      color: "text-ai-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statCards.map((stat) => (
        <div key={stat.label} className="bg-surface rounded-lg p-4">
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider">
            {stat.label}
          </div>
          <div className={`text-2xl font-bold mt-1 ${stat.color}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
