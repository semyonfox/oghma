'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useQuizStore from '@/lib/notes/state/quiz';
import ProgressBar from '@/components/quiz/progress-bar';
import QuestionCard from '@/components/quiz/question-card';
import RatingButtons from '@/components/quiz/rating-buttons';
import Feedback from '@/components/quiz/feedback';
import { getNextIntervals, cardFromDB } from '@/lib/quiz/fsrs';

export default function QuizSessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;
    const {
        cardIds, currentIndex, currentQuestion, sessionProgress,
        fatigueWarning, startSession, advanceQuestion, setFatigueWarning, endSession,
    } = useQuizStore();

    const [answered, setAnswered] = useState(false);
    const [lastAnswer, setLastAnswer] = useState<{ answer: string; wasCorrect: boolean } | null>(null);
    const [streak, setStreak] = useState(0);
    const startTimeRef = useRef(Date.now());
    const prevQuestionRef = useRef(currentQuestion);

    // compute intervals from current question (pure derivation, no effect)
    const intervals = useMemo<Record<1 | 2 | 3 | 4, number>>(() => {
        if (!currentQuestion) return { 1: 0, 2: 0, 3: 0, 4: 0 };
        try {
            if (currentQuestion.intervals) return currentQuestion.intervals;
            const card = cardFromDB(currentQuestion);
            return getNextIntervals(card);
        } catch {
            return { 1: 0, 2: 1, 3: 3, 4: 7 };
        }
    }, [currentQuestion]);

    // reset answer state when question changes
    if (currentQuestion !== prevQuestionRef.current) {
        prevQuestionRef.current = currentQuestion;
        if (currentQuestion) {
            setAnswered(false);
            setLastAnswer(null);
            startTimeRef.current = Date.now();
        }
    }

    // load session on mount
    useEffect(() => {
        if (!cardIds.length) {
            fetch(`/api/quiz/sessions/${sessionId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.cardIds) {
                        startSession(sessionId, data.cardIds, data.question);
                    }
                });
        }
    }, [sessionId, cardIds.length, startSession]);

    // fetch streak
    useEffect(() => {
        fetch('/api/quiz/streak').then(r => r.json()).then(d => setStreak(d.current_streak || 0));
    }, []);

    const handleAnswer = useCallback((answer: string, wasCorrect: boolean) => {
        setAnswered(true);
        setLastAnswer({ answer, wasCorrect });
    }, []);

    const handleRate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
        if (!lastAnswer || !currentQuestion) return;

        const nextCardId = currentIndex + 1 < cardIds.length ? cardIds[currentIndex + 1] : null;
        const responseTimeMs = Date.now() - startTimeRef.current;

        const res = await fetch(`/api/quiz/sessions/${sessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardId: currentQuestion.card_id,
                rating,
                userAnswer: lastAnswer.answer,
                wasCorrect: lastAnswer.wasCorrect,
                responseTimeMs,
                nextCardId,
            }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.fatigueWarning) setFatigueWarning(true);

        if (data.nextQuestion) {
            advanceQuestion(data.nextQuestion, data.sessionProgress);
        } else {
            endSession();
            router.push('/quiz');
        }
    }, [lastAnswer, currentQuestion, currentIndex, cardIds, sessionId, advanceQuestion, setFatigueWarning, endSession, router]);

    if (!currentQuestion) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-text-tertiary text-sm">Loading quiz...</div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col px-6 py-6 max-w-2xl mx-auto">
            <ProgressBar
                current={sessionProgress.answered}
                total={sessionProgress.total}
                onBack={() => { endSession(); router.push('/quiz'); }}
                streak={streak}
            />

            {fatigueWarning && (
                <div className="mt-4 bg-ai-500/10 border border-ai-500/20 rounded-lg p-3 text-xs text-ai-400">
                    You're getting quite a few wrong this session. Consider taking a break — rest helps memory consolidation.
                </div>
            )}

            <div className="flex-1 flex flex-col mt-6">
                <QuestionCard
                    question={currentQuestion}
                    onAnswer={handleAnswer}
                />

                {answered && lastAnswer && (
                    <div className="mt-4 space-y-4">
                        <Feedback
                            wasCorrect={lastAnswer.wasCorrect}
                            explanation={currentQuestion.explanation}
                            correctAnswer={currentQuestion.correct_answer}
                        />
                        <RatingButtons intervals={intervals} onRate={handleRate} />
                    </div>
                )}
            </div>
        </div>
    );
}
