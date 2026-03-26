'use client';

import { useEffect, useRef } from 'react';

interface StreakDisplayProps {
    currentStreak: number;
    longestStreak: number;
    newMilestone?: number | null;
}

export default function StreakDisplay({ currentStreak, longestStreak, newMilestone }: StreakDisplayProps) {
    const confettiRef = useRef(false);

    useEffect(() => {
        if (newMilestone && !confettiRef.current) {
            confettiRef.current = true;
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            });
        }
    }, [newMilestone]);

    return (
        <div className="flex items-center gap-2 bg-ai-500/10 text-ai-400 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <span className="text-base">🔥</span>
            <span>{currentStreak} day{currentStreak !== 1 ? 's' : ''}</span>
        </div>
    );
}
