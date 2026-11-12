"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface ProgressBarProps {
  current: number;
  total: number;
  onBack: () => void;
  onSkip?: () => void;
}

export default function ProgressBar({
  current,
  total,
  onBack,
  onSkip,
}: ProgressBarProps) {
  const { t } = useI18n();
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="min-h-11 rounded-radius-md px-2 text-sm text-text-secondary transition-colors hover:bg-subtle hover:text-text"
      >
        {t("quiz.progress.back")}
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle-hover">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-text-secondary tabular-nums">
        {current}/{total}
      </span>
      {onSkip && (
        <button
          onClick={onSkip}
          className="min-h-11 rounded-radius-md px-2 text-sm text-text-secondary transition-colors hover:bg-subtle hover:text-text"
        >
          {t("quiz.progress.skip")}
        </button>
      )}
    </div>
  );
}
