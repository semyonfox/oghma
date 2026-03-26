'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useQuizStore from '@/lib/notes/state/quiz';
import ProgressBar from '@/components/quiz/progress-bar';
import QuestionCard from '@/components/quiz/question-card';
import RatingButtons from '@/components/quiz/rating-buttons';
import Feedback from '@/components/quiz/feedback';
import { getNextIntervals, cardFromDB } from '@/lib/quiz/fsrs';

// inner component that resets naturally via key prop when question changes
function QuestionView({
    question,
    intervals,
    sessionId,
    currentIndex,
    cardIds,
    sessionProgress,
    fatigueWarning,
    advanceQuestion,
    setFatigueWarning,
    endSession,
}: {
    question: any;
    intervals: Record<1 | 2 | 3 | 4, number>;
    sessionId: string;
    currentIndex: number;
    cardIds: string[];
    sessionProgress: { answered: number; total: number; correct: number };
    fatigueWarning: boolean;
    advanceQuestion: (q: any, p: any) => void;
    setFatigueWarning: (w: boolean) => void;
    endSession: () => void;
}) {
    const router = useRouter();
    const [answered, setAnswered] = useState(false);
    const [lastAnswer, setLastAnswer] = useState<{ answer: string; wasCorrect: boolean } | null>(null);
    const startTimeRef = useRef(0);

    useEffect(() => {
        startTimeRef.current = Date.now();
    }, []);

    const handleAnswer = useCallback((answer: string, wasCorrect: boolean) => {
        setAnswered(true);
        setLastAnswer({ answer, wasCorrect });
    }, []);

    const handleRate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
        if (!lastAnswer) return;

        const nextCardId = currentIndex + 1 < cardIds.length ? cardIds[currentIndex + 1] : null;
        const responseTimeMs = Date.now() - startTimeRef.current;

        const res = await fetch(`/api/quiz/sessions/${sessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardId: question.card_id,
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
    }, [lastAnswer, question, currentIndex, cardIds, sessionId, advanceQuestion, setFatigueWarning, endSession, router]);

    return (
        <>
            {fatigueWarning && (
                <div className="mt-4 bg-ai-500/10 border border-ai-500/20 rounded-lg p-3 text-xs text-ai-400">
                    You're getting quite a few wrong this session. Consider taking a break — rest helps memory consolidation.
                </div>
            )}

            <div className="flex-1 flex flex-col mt-6">
                <QuestionCard
                    question={question}
                    onAnswer={handleAnswer}
                />

                {answered && lastAnswer && (
                    <div className="mt-4 space-y-4">
                        <Feedback
                            wasCorrect={lastAnswer.wasCorrect}
                            explanation={question.explanation}
                            correctAnswer={question.correct_answer}
                        />
                        <RatingButtons intervals={intervals} onRate={handleRate} />
                    </div>
                )}
            </div>
        </>
    );
}

export default function QuizSessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;
    const {
        cardIds, currentIndex, currentQuestion, sessionProgress,
        fatigueWarning, startSession, advanceQuestion, setFatigueWarning, endSession,
    } = useQuizStore();

    const [streak, setStreak] = useState(0);

    // compute intervals from current question (pure derivation)
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

    if (!currentQuestion) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-text-tertiary text-sm">Loading quiz...</div>
            </div>
        );
    }

    // key on card_id forces QuestionView to remount when question changes,
    // naturally resetting answered/lastAnswer state without manual setState
    return (
        <div className="h-screen flex flex-col px-6 py-6 max-w-2xl mx-auto">
            <ProgressBar
                current={sessionProgress.answered}
                total={sessionProgress.total}
                onBack={() => { endSession(); router.push('/quiz'); }}
                streak={streak}
            />

            <QuestionView
                key={currentQuestion.card_id}
                question={currentQuestion}
                intervals={intervals}
                sessionId={sessionId}
                currentIndex={currentIndex}
                cardIds={cardIds}
                sessionProgress={sessionProgress}
                fatigueWarning={fatigueWarning}
                advanceQuestion={advanceQuestion}
                setFatigueWarning={setFatigueWarning}
                endSession={endSession}
            />
        </div>
    );
}
