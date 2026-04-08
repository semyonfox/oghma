"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { triggerCelebration } from "@/lib/celebration";
import ProgressBar from "@/components/quiz/progress-bar";
import QuestionCard from "@/components/quiz/question-card";
import Feedback from "@/components/quiz/feedback";

function SessionComplete({
  progress,
  elapsed,
  onBack,
}: {
  progress: { answered: number; total: number; correct: number };
  elapsed: number;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const confettiRef = useRef(false);
  const accuracy =
    progress.answered > 0
      ? Math.round((progress.correct / progress.answered) * 100)
      : 0;

  useEffect(() => {
    if (accuracy === 100 && !confettiRef.current) {
      confettiRef.current = true;
      void triggerCelebration("quiz_perfect");
    }
  }, [accuracy]);

  const minutes = Math.max(1, Math.round(elapsed / 60000));
  const advancing = progress.correct;
  const forTomorrow = progress.answered - progress.correct;

  return (
    <div className="h-screen flex items-center justify-center px-6 bg-app-page text-text">
      <div className="max-w-md w-full text-center">
        <h1 className="font-serif text-text text-xl font-semibold">
          {t("quiz.complete.title")}
        </h1>
        <p className="text-text-secondary text-sm mt-2">
          {t("quiz.complete.score", {
            correct: progress.correct,
            total: progress.answered,
          })}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-6">
          {[
            { label: t("quiz.complete.time"), value: `${minutes} min` },
            { label: t("quiz.complete.accuracy"), value: `${accuracy}%` },
            { label: t("quiz.complete.advancing"), value: String(advancing) },
            {
              label: t("quiz.complete.for_tomorrow"),
              value: String(forTomorrow),
            },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-radius-lg p-3">
              <div className="text-text-tertiary text-xs uppercase tracking-wider">
                {stat.label}
              </div>
              <div className="text-text font-medium text-lg mt-1">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onBack}
          className="mt-8 glass-card-interactive text-text-secondary text-sm px-6 py-2.5 rounded-radius-lg"
        >
          {t("quiz.complete.back")}
        </button>
      </div>
    </div>
  );
}

function QuestionView({
  question,
  sessionId,
  currentIndex,
  cardIds,
  fatigueWarning,
  advanceQuestion,
  setFatigueWarning,
  onComplete,
}: {
  question: any;
  sessionId: string;
  currentIndex: number;
  cardIds: string[];
  fatigueWarning: boolean;
  advanceQuestion: (q: any, p: any) => void;
  setFatigueWarning: (w: boolean) => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{
    answer: string;
    wasCorrect: boolean;
  } | null>(null);
  const [isLeech, setIsLeech] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  const handleAnswer = useCallback((answer: string, wasCorrect: boolean) => {
    setAnswered(true);
    setLastAnswer({ answer, wasCorrect });
  }, []);

  const handleContinue = useCallback(async () => {
    if (!lastAnswer) return;

    const nextCardId =
      currentIndex + 1 < cardIds.length ? cardIds[currentIndex + 1] : null;
    const startTime = startTimeRef.current ?? Date.now();
    const responseTimeMs = Date.now() - startTime;

    const res = await fetch(`/api/quiz/sessions/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: question.card_id,
        userAnswer: lastAnswer.answer,
        wasCorrect: lastAnswer.wasCorrect,
        responseTimeMs,
        nextCardId,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();

    if (data.fatigueWarning) setFatigueWarning(true);
    if (data.isLeech) setIsLeech(true);

    if (data.nextQuestion) {
      advanceQuestion(data.nextQuestion, data.sessionProgress);
    } else {
      onComplete();
    }
  }, [
    lastAnswer,
    question,
    currentIndex,
    cardIds,
    sessionId,
    advanceQuestion,
    setFatigueWarning,
    onComplete,
  ]);

  // keyboard: Enter/Space to continue after answering
  useEffect(() => {
    if (!answered || !lastAnswer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answered, lastAnswer, handleContinue]);

  return (
    <>
      {fatigueWarning && (
        <div className="mt-4 glass-card rounded-radius-lg p-3 text-xs text-text-tertiary">
          {t("quiz.session.fatigue_warning")}
        </div>
      )}

      <div className="flex-1 flex flex-col mt-6">
        <QuestionCard question={question} onAnswer={handleAnswer} />

        {answered && lastAnswer && (
          <div className="mt-4 space-y-3">
            <Feedback
              wasCorrect={lastAnswer.wasCorrect}
              explanation={question.explanation}
              correctAnswer={question.correct_answer}
            />
            {isLeech && (
              <p className="text-text-tertiary text-xs">
                {t("quiz.session.leech_warning")}
              </p>
            )}
            <div className="flex justify-center">
              <button
                onClick={handleContinue}
                className="glass-card-interactive text-text-secondary text-sm px-6 py-2.5 rounded-radius-lg"
              >
                {t("quiz.session.continue")}
              </button>
            </div>
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
    cardIds,
    currentIndex,
    currentQuestion,
    sessionProgress,
    sessionStartTime,
    sessionEndTime,
    sessionCompleted,
    fatigueWarning,
    startSession,
    setCurrentQuestion,
    advanceQuestion,
    setFatigueWarning,
    completeSession,
    endSession,
  } = useQuizStore();
  const { t } = useI18n();

  const [streak, setStreak] = useState(0);

  // load session on mount if store is empty (e.g. page refresh)
  useEffect(() => {
    if (!cardIds.length) {
      fetch(`/api/quiz/sessions/${sessionId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          if (Array.isArray(data.cardIds) && data.cardIds.length > 0) {
            startSession(
              sessionId,
              data.cardIds,
              data.question ?? null,
              data.currentIndex ?? 0,
            );
          } else {
            // session gone, completed, or malformed — exit
            completeSession();
          }
        })
        .catch(() => completeSession());
    }
  }, [sessionId, cardIds.length, startSession, completeSession]);

  // if the store has card IDs but no question (e.g. first question lookup failed), fetch it directly
  useEffect(() => {
    if (cardIds.length > 0 && !currentQuestion && !sessionCompleted) {
      const cardId = cardIds[currentIndex] ?? cardIds[0];
      fetch(`/api/quiz/cards/${cardId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.question) setCurrentQuestion(data.question);
          else completeSession();
        })
        .catch(() => completeSession());
    }
  }, [cardIds, currentQuestion, currentIndex, sessionCompleted, setCurrentQuestion, completeSession]);

  // fetch streak for progress bar
  useEffect(() => {
    fetch("/api/quiz/streak")
      .then((r) => r.json())
      .then((d) => setStreak(d.current_streak || 0));
  }, []);

  const handleSkip = useCallback(async () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= cardIds.length) {
      completeSession();
      return;
    }

    // fetch the next card's question data without recording a review
    const nextCardId = cardIds[nextIdx];
    try {
      const res = await fetch(`/api/quiz/cards/${nextCardId}`);
      if (!res.ok) {
        completeSession();
        return;
      }
      const data = await res.json();
      advanceQuestion(data.question, sessionProgress);
    } catch {
      completeSession();
    }
  }, [
    currentIndex,
    cardIds,
    sessionProgress,
    advanceQuestion,
    completeSession,
  ]);

  if (sessionCompleted) {
    return (
      <SessionComplete
        progress={sessionProgress}
        elapsed={Math.max(0, sessionEndTime - sessionStartTime)}
        onBack={() => {
          endSession();
          router.push("/quiz");
        }}
      />
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-screen bg-app-page">
        <div className="text-text-tertiary text-sm">
          {t("quiz.session.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col px-6 py-6 max-w-2xl mx-auto bg-app-page text-text">
      <ProgressBar
        current={sessionProgress.answered}
        total={sessionProgress.total}
        onBack={() => {
          endSession();
          router.push("/quiz");
        }}
        streak={streak}
        onSkip={handleSkip}
      />

      <QuestionView
        key={currentQuestion.card_id}
        question={currentQuestion}
        sessionId={sessionId}
        currentIndex={currentIndex}
        cardIds={cardIds}
        fatigueWarning={fatigueWarning}
        advanceQuestion={advanceQuestion}
        setFatigueWarning={setFatigueWarning}
        onComplete={completeSession}
      />
    </div>
  );
}
