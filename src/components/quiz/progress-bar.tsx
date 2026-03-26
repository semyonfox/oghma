'use client';

interface ProgressBarProps {
    current: number;
    total: number;
    onBack: () => void;
    streak: number;
}

export default function ProgressBar({ current, total, onBack, streak }: ProgressBarProps) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-text-tertiary text-xs hover:text-text-secondary transition-colors">
                ← Back
            </button>
            <div className="flex-1 h-1 bg-surface rounded-full">
                <div
                    className="h-full bg-secondary-500 rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-text-tertiary text-xs">{current}/{total}</span>
            {streak > 0 && (
                <div className="bg-ai-500/10 text-ai-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                    🔥 {streak}
                </div>
            )}
        </div>
    );
}
