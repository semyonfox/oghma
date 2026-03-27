"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface RatingButtonsProps {
  intervals: Record<1 | 2 | 3 | 4, number>;
  onRate: (rating: 1 | 2 | 3 | 4) => void;
}

function formatInterval(
  days: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (days < 1) return t("quiz.rating.interval.less_than_min");
  if (days === 1) return t("quiz.rating.interval.one_day");
  if (days < 30) return t("quiz.rating.interval.days", { count: days });
  if (days < 365)
    return t("quiz.rating.interval.months", { count: Math.round(days / 30) });
  return t("quiz.rating.interval.years", { count: Math.round(days / 365) });
}

const BUTTON_STYLES: {
  rating: 1 | 2 | 3 | 4;
  labelKey: string;
  bg: string;
  text: string;
}[] = [
  {
    rating: 1,
    labelKey: "quiz.rating.again",
    bg: "bg-error-500",
    text: "text-white",
  },
  {
    rating: 2,
    labelKey: "quiz.rating.hard",
    bg: "bg-ai-500/20",
    text: "text-ai-400",
  },
  {
    rating: 3,
    labelKey: "quiz.rating.good",
    bg: "bg-success-500/20",
    text: "text-success-400",
  },
  {
    rating: 4,
    labelKey: "quiz.rating.easy",
    bg: "bg-primary-500/20",
    text: "text-primary-400",
  },
];

export default function RatingButtons({
  intervals,
  onRate,
}: RatingButtonsProps) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 justify-center">
      {BUTTON_STYLES.map(({ rating, labelKey, bg, text }) => (
        <button
          key={rating}
          onClick={() => onRate(rating)}
          className={`${bg} ${text} px-5 py-2 rounded-lg text-xs font-medium flex-1 max-w-[100px] text-center hover:opacity-80 transition-opacity`}
        >
          <div>{t(labelKey)}</div>
          <div className="opacity-60 text-[10px] mt-0.5">
            {formatInterval(intervals[rating], t)}
          </div>
        </button>
      ))}
    </div>
  );
}
