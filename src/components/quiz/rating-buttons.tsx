'use client';

interface RatingButtonsProps {
    intervals: Record<1 | 2 | 3 | 4, number>;
    onRate: (rating: 1 | 2 | 3 | 4) => void;
}

function formatInterval(days: number): string {
    if (days < 1) return '<1min';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.round(days / 30)} mo`;
    return `${Math.round(days / 365)} yr`;
}

const BUTTONS: { rating: 1 | 2 | 3 | 4; label: string; bg: string; text: string }[] = [
    { rating: 1, label: 'Again', bg: 'bg-error-500', text: 'text-white' },
    { rating: 2, label: 'Hard', bg: 'bg-ai-500/20', text: 'text-ai-400' },
    { rating: 3, label: 'Good', bg: 'bg-success-500/20', text: 'text-success-400' },
    { rating: 4, label: 'Easy', bg: 'bg-primary-500/20', text: 'text-primary-400' },
];

export default function RatingButtons({ intervals, onRate }: RatingButtonsProps) {
    return (
        <div className="flex gap-2 justify-center">
            {BUTTONS.map(({ rating, label, bg, text }) => (
                <button
                    key={rating}
                    onClick={() => onRate(rating)}
                    className={`${bg} ${text} px-5 py-2 rounded-lg text-xs font-medium flex-1 max-w-[100px] text-center hover:opacity-80 transition-opacity`}
                >
                    <div>{label}</div>
                    <div className="opacity-60 text-[10px] mt-0.5">{formatInterval(intervals[rating])}</div>
                </button>
            ))}
        </div>
    );
}
