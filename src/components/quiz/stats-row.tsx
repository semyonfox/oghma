'use client';

interface StatsRowProps {
    mastery: number;
    dueCount: number;
    reviewedToday: number;
    weekAccuracy: number;
}

export default function StatsRow({ mastery, dueCount, reviewedToday, weekAccuracy }: StatsRowProps) {
    const statCards = [
        { label: 'Overall Mastery', value: `${mastery}%`, color: mastery > 75 ? 'text-success-400' : mastery > 50 ? 'text-ai-400' : 'text-error-400' },
        { label: 'Due Today', value: String(dueCount), color: 'text-primary-400' },
        { label: 'Reviewed Today', value: String(reviewedToday), color: 'text-secondary-400' },
        { label: 'Accuracy (7d)', value: `${weekAccuracy}%`, color: 'text-ai-400' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((stat) => (
                <div key={stat.label} className="bg-surface rounded-lg p-4">
                    <div className="text-text-tertiary text-[10px] uppercase tracking-wider">{stat.label}</div>
                    <div className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
                </div>
            ))}
        </div>
    );
}
