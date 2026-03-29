"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface ProgressBarProps {
  current: number;
  total: number;
  onBack: () => void;
  streak: number;
  onSkip?: () => void;
}

export default function ProgressBar({
  current,
  total,
  onBack,
  streak: _streak,
  onSkip,
}: ProgressBarProps) {
  const { t } = useI18n();
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
      >
        {t("quiz.progress.back")}
      </button>
      <div className="flex-1 h-1 bg-surface rounded-full">
        <div
          className="h-full bg-text-tertiary rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-text-tertiary text-xs">
        {current}/{total}
      </span>
      {onSkip && (
        <button
          onClick={onSkip}
          className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
        >
          {t("quiz.progress.skip")}
        </button>
      )}
    </div>
  );
}
