"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { triggerCelebration } from "@/lib/celebration";
import type { CelebrationType } from "@/lib/celebration";
import { browserTimeZone } from "@/lib/quiz/time-zone";
import type {
  QuizAnswerResponse,
  QuizCardResponse,
  QuizSessionProgress,
  QuizSessionQuestion,
  QuizSessionResumeResponse,
} from "@/lib/quiz/types";
import ProgressBar from "@/components/quiz/progress-bar";
import QuestionCard from "@/components/quiz/question-card";
import Feedback from "@/components/quiz/feedback";

function SessionComplete({
  progress,
  elapsed,
  onBack,
}: {
  progress: QuizSessionProgress;
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
    if (confettiRef.current) return;
    if (accuracy >= 80) {
      confettiRef.current = true;
      void triggerCelebration(accuracy === 100 ? "quiz_perfect" : "quiz_good");
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
  fatigueWarning,
  onAnswered,
  onComplete,
}: {
  question: QuizSessionQuestion;
  sessionId: string;
  fatigueWarning: boolean;
  onAnswered: (data: QuizAnswerResponse) => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{
    answer: string;
    wasCorrect: boolean;
  } | null>(null);
  const [isLeech, setIsLeech] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  // guards Enter and click landing together; state updates are too late for that
  const submittingRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  const handleAnswer = useCallback((answer: string, wasCorrect: boolean) => {
    setAnswered(true);
    setLastAnswer({ answer, wasCorrect });
  }, []);

  const handleContinue = useCallback(async () => {
    if (!lastAnswer || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitFailed(false);

    const startTime = startTimeRef.current ?? Date.now();
    try {
      const res = await fetch(`/api/quiz/sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: question.card_id,
          userAnswer: lastAnswer.answer,
          responseTimeMs: Date.now() - startTime,
          timeZone: browserTimeZone(),
        }),
      });
      if (!res.ok) throw new Error(`answer failed with ${res.status}`);
      const data = (await res.json()) as QuizAnswerResponse;

      if (data.isLeech) setIsLeech(true);
      // streak confetti — fires once when the round threshold is crossed
      if (data.streakResult?.advanced) {
        const type: CelebrationType = data.streakResult.newMilestone
          ? "streak_milestone"
          : "streak";
        void triggerCelebration(type);
      }

      onAnswered(data);
      if (!data.nextQuestion) onComplete();
    } catch {
      // the answer route is idempotent per card, so retrying is always safe
      setSubmitFailed(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [lastAnswer, question.card_id, sessionId, onAnswered, onComplete]);

  // keyboard: Enter/Space to continue after answering
  useEffect(() => {
    if (!answered || !lastAnswer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void handleContinue();
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
              questionId={question.id}
            />
            {isLeech && (
              <p className="text-text-tertiary text-xs">
                {t("quiz.session.leech_warning")}
              </p>
            )}
            {submitFailed && (
              <p role="alert" className="text-error-500 text-xs text-center">
                {t("quiz.session.answer_failed")}
              </p>
            )}
            <div className="flex justify-center">
              <button
                onClick={() => void handleContinue()}
                disabled={submitting}
                className="glass-card-interactive text-text-secondary text-sm px-6 py-2.5 rounded-radius-lg disabled:opacity-50"
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

async function fetchCardQuestion(
  cardId: string,
): Promise<QuizSessionQuestion | null> {
  const res = await fetch(`/api/quiz/cards/${cardId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as QuizCardResponse;
  return data.question ?? null;
}

export default function QuizSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;
  const {
    sessionId: storedSessionId,
    cardIds,
    currentIndex,
    currentQuestion,
    sessionProgress,
    sessionStartTime,
    sessionEndTime,
    sessionCompleted,
    fatigueWarning,
    startSession,
    showQuestion,
    setProgress,
    setFatigueWarning,
    completeSession,
    endSession,
  } = useQuizStore();
  const { t } = useI18n();

  const isCurrentSession = storedSessionId === sessionId && cardIds.length > 0;

  const finishSession = useCallback(() => {
    completeSession();
    // mark it finished server-side too so a refresh shows the summary
    void fetch(`/api/quiz/sessions/${sessionId}`, { method: "DELETE" }).catch(
      () => {},
    );
  }, [completeSession, sessionId]);

  // load from the server on refresh, or when the store still holds a
  // different session (back/forward navigation never calls endSession)
  useEffect(() => {
    if (isCurrentSession) return;
    let cancelled = false;
    fetch(`/api/quiz/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: QuizSessionResumeResponse) => {
        if (cancelled) return;
        if (!Array.isArray(data.cardIds) || data.cardIds.length === 0) {
          startSession(sessionId, [], null);
          completeSession();
          return;
        }
        startSession(sessionId, data.cardIds, data.question, {
          currentIndex: data.currentIndex,
          answered: data.answeredCount,
          correct: data.correct_count,
        });
        if (data.completed) completeSession();
      })
      .catch(() => {
        if (cancelled) return;
        // session gone or not ours — show the empty summary with a way back
        startSession(sessionId, [], null);
        completeSession();
      });
    return () => {
      cancelled = true;
    };
  }, [isCurrentSession, sessionId, startSession, completeSession]);

  // the store has card IDs but no question (e.g. first question lookup failed)
  useEffect(() => {
    if (!isCurrentSession || currentQuestion || sessionCompleted) return;
    const cardId = cardIds[currentIndex];
    if (!cardId) {
      finishSession();
      return;
    }
    fetchCardQuestion(cardId)
      .then((question) => {
        if (question) showQuestion(question);
        else finishSession();
      })
      .catch(() => finishSession());
  }, [
    isCurrentSession,
    cardIds,
    currentQuestion,
    currentIndex,
    sessionCompleted,
    showQuestion,
    finishSession,
  ]);

  const handleAnswered = useCallback(
    (data: QuizAnswerResponse) => {
      setProgress(data.sessionProgress);
      if (data.fatigueWarning) setFatigueWarning(true);
      if (data.nextQuestion) showQuestion(data.nextQuestion);
    },
    [setProgress, setFatigueWarning, showQuestion],
  );

  // move on without recording a review; cards removed since the session
  // started are skipped over
  const handleSkip = useCallback(async () => {
    for (let index = currentIndex + 1; index < cardIds.length; index++) {
      try {
        const question = await fetchCardQuestion(cardIds[index]);
        if (question) {
          showQuestion(question);
          return;
        }
      } catch {
        break;
      }
    }
    finishSession();
  }, [currentIndex, cardIds, showQuestion, finishSession]);

  if (sessionCompleted && storedSessionId === sessionId) {
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

  if (!isCurrentSession || !currentQuestion) {
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
        current={currentIndex}
        total={cardIds.length}
        onBack={() => {
          endSession();
          router.push("/quiz");
        }}
        onSkip={handleSkip}
      />

      <QuestionView
        key={currentQuestion.card_id}
        question={currentQuestion}
        sessionId={sessionId}
        fatigueWarning={fatigueWarning}
        onAnswered={handleAnswered}
        onComplete={finishSession}
      />
    </div>
  );
}
