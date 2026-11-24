"use client";

import { useEffect, useLayoutEffect, useState, useRef, useEffectEvent } from "react";
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
import { CheckIcon } from "@heroicons/react/20/solid";

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
    <div className="flex h-app items-center justify-center bg-app-page px-4 text-text sm:px-6">
      <div className="w-full max-w-xl rounded-radius-2xl border border-border bg-surface-overlay p-6 text-center shadow-float sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-400">
          <CheckIcon aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight text-text">
          {t("quiz.complete.title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t("quiz.complete.score", {
            correct: progress.correct,
            total: progress.answered,
          })}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 text-left">
          {[
            { label: t("quiz.complete.time"), value: `${minutes} min` },
            { label: t("quiz.complete.accuracy"), value: `${accuracy}%` },
            { label: t("quiz.complete.advancing"), value: String(advancing) },
            {
              label: t("quiz.complete.for_tomorrow"),
              value: String(forTomorrow),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-radius-xl border border-border bg-surface-elevated px-4 py-3"
            >
              <div className="text-xs text-text-tertiary">{stat.label}</div>
              <div className="mt-1 font-serif text-[26px] font-bold tabular-nums text-text">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-6 h-1.5 overflow-hidden rounded-full bg-subtle-hover"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-success-700 dark:bg-success-400"
            style={{ width: `${accuracy}%` }}
          />
        </div>

        <button
          onClick={onBack}
          className="mt-8 min-h-11 rounded-radius-lg bg-action px-6 py-2.5 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
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
  isCurrentQuestion,
  advancing,
  startAdvance,
  finishAdvance,
}: {
  question: QuizSessionQuestion;
  sessionId: string;
  fatigueWarning: boolean;
  onAnswered: (data: QuizAnswerResponse) => void;
  isCurrentQuestion: () => boolean;
  advancing: boolean;
  startAdvance: () => boolean;
  finishAdvance: () => void;
}) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{
    answer: string;
    wasCorrect: boolean;
    rating?: 1 | 2 | 3 | 4;
  } | null>(null);
  const [isLeech, setIsLeech] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  const handleAnswer = (answer: string, wasCorrect: boolean, rating?: 1 | 2 | 3 | 4) => {
    setAnswered(true);
    setLastAnswer({ answer, wasCorrect, rating });
  };

  const handleContinue = async () => {
    if (!lastAnswer || !startAdvance()) return;
    setSubmitFailed(false);

    const startTime = startTimeRef.current ?? Date.now();
    const run = async () => {
      const res = await fetch(`/api/quiz/sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: question.card_id,
          userAnswer: lastAnswer.answer,
          rating: lastAnswer.rating,
          responseTimeMs: Date.now() - startTime,
          timeZone: browserTimeZone(),
        }),
      });
      if (!res.ok) throw new Error(`answer failed with ${res.status}`);
      const data: QuizAnswerResponse = await res.json();
      if (!isCurrentQuestion()) return;

      if (data.isLeech) setIsLeech(true);
      // streak confetti — fires once when the round threshold is crossed
      if (data.streakResult?.advanced) {
        const type: CelebrationType = data.streakResult.newMilestone
          ? "streak_milestone"
          : "streak";
        void triggerCelebration(type);
      }

      onAnswered(data);
    };
    await run()
      .catch(() => {
        // the answer route is idempotent per card, so retrying is always safe
        setSubmitFailed(true);
      })
      .finally(finishAdvance);
  };

  // keyboard: Enter/Space to continue after answering
  const continueFromKeyboard = useEffectEvent(() => void handleContinue());
  useEffect(() => {
    if (!answered || !lastAnswer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        continueFromKeyboard();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answered, lastAnswer]);

  return (
    <>
      {fatigueWarning && (
        <div className="mt-4 rounded-radius-lg border border-warning-500/40 bg-warning-500/10 p-3 text-xs text-text-secondary">
          {t("quiz.session.fatigue_warning")}
        </div>
      )}

      <div className="flex-1 flex flex-col mt-6">
        <QuestionCard
          question={question}
          questionId={question.id}
          onAnswer={handleAnswer}
        />

        {answered && lastAnswer && (
          <div className="mt-4 space-y-3 pb-4">
            {/* continue sits right under the options so the pointer barely moves */}
            <div className="flex items-center justify-end gap-3">
              {submitFailed && (
                <p role="alert" className="text-xs text-error-700 dark:text-error-400">
                  {t("quiz.session.answer_failed")}
                </p>
              )}
              <button
                onClick={() => void handleContinue()}
                disabled={advancing}
                className="min-h-11 rounded-radius-lg bg-action px-6 py-2.5 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
              >
                {t("quiz.session.continue")}
              </button>
            </div>
            {isLeech && (
              <p className="text-text-tertiary text-xs">
                {t("quiz.session.leech_warning")}
              </p>
            )}
            <Feedback
              wasCorrect={lastAnswer.wasCorrect}
              explanation={question.explanation}
              correctAnswer={question.correct_answer}
              questionId={question.id}
            />
          </div>
        )}
      </div>
    </>
  );
}

async function findNextQuestion(
  cardIds: string[],
  start: number,
  signal: AbortSignal,
): Promise<QuizSessionQuestion | null> {
  for (const cardId of cardIds.slice(start)) {
    const res = await fetch(`/api/quiz/cards/${cardId}`, { signal });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`card lookup failed with ${res.status}`);
    const data: QuizCardResponse = await res.json();
    if (data.question?.card_id !== cardId) throw new Error("Invalid quiz card");
    return data.question;
  }
  return null;
}

export default function QuizSessionPage() {
  const { id } = useParams<{ id: string }>();
  return <QuizSession key={id} sessionId={id} />;
}

function QuizSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
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

  const [lookupFailed, setLookupFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  // click and keyboard handlers can run before the disabled state renders
  const advancingRef = useRef(false);

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  const isCurrentSession = storedSessionId === sessionId;
  const isCurrentQuestion = () => {
    const active = useQuizStore.getState();
    return Boolean(lifetime.current && !lifetime.current.signal.aborted) &&
      active.sessionId === sessionId &&
      active.cardIds === cardIds &&
      active.currentIndex === currentIndex &&
      active.currentQuestion === currentQuestion &&
      !active.sessionCompleted;
  };

  const startAdvance = () => {
    if (advancingRef.current || !isCurrentQuestion()) return false;
    advancingRef.current = true;
    setAdvancing(true);
    return true;
  };

  const finishAdvance = () => {
    advancingRef.current = false;
    setAdvancing(false);
  };

  const finishSession = () => {
    completeSession();
    // mark it finished server-side too so a refresh shows the summary
    void fetch(`/api/quiz/sessions/${sessionId}`, { method: "DELETE" }).catch(
      () => {},
    );
  };

  // load from the server on refresh or browser history navigation
  useEffect(() => {
    if (isCurrentSession) return;
    const controller = new AbortController();
    const { signal } = controller;
    const loadSession = async () => {
      const response = await fetch(`/api/quiz/sessions/${sessionId}`, { signal });
      if (signal.aborted || lifetime.current?.signal.aborted) return;
      if (response.status === 404) {
        startSession(sessionId, [], null);
        completeSession();
        return;
      }
      if (!response.ok) throw new Error(`session lookup failed with ${response.status}`);
      const data: QuizSessionResumeResponse = await response.json();
      if (signal.aborted || lifetime.current?.signal.aborted) return;
      startSession(sessionId, data.cardIds, data.question, {
        currentIndex: data.currentIndex,
        answered: data.answeredCount,
        correct: data.correct_count,
      });
      if (data.completed) completeSession();
    };
    void loadSession().catch(() => {
      if (!signal.aborted && !lifetime.current?.signal.aborted) setLookupFailed(true);
    });
    return () => controller.abort();
  }, [isCurrentSession, retryAttempt, sessionId, startSession, completeSession]);

  const applyLookup = (question: QuizSessionQuestion | null) => {
    if (!isCurrentQuestion()) return;
    if (question) showQuestion(question);
    else finishSession();
  };

  // a newly started session can have card IDs before the first question loads
  const applyFallback = useEffectEvent((
    question: QuizSessionQuestion | null,
    expectedCards: string[],
    expectedIndex: number,
  ) => {
    if (cardIds === expectedCards && currentIndex === expectedIndex && !currentQuestion) {
      applyLookup(question);
    }
  });
  useEffect(() => {
    if (!isCurrentSession || currentQuestion || sessionCompleted) return;
    const controller = new AbortController();
    const { signal } = controller;
    void findNextQuestion(cardIds, currentIndex, signal)
      .then((question) => {
        if (!signal.aborted) applyFallback(question, cardIds, currentIndex);
      })
      .catch(() => {
        if (!signal.aborted && !lifetime.current?.signal.aborted) setLookupFailed(true);
      });
    return () => controller.abort();
  }, [isCurrentSession, cardIds, currentQuestion, currentIndex, sessionCompleted, retryAttempt]);

  const handleAnswered = (data: QuizAnswerResponse) => {
    setLookupFailed(false);
    setProgress(data.sessionProgress);
    if (data.fatigueWarning) setFatigueWarning(true);
    if (data.nextQuestion) showQuestion(data.nextQuestion);
    else finishSession();
  };

  const handleSkip = async () => {
    const signal = lifetime.current?.signal;
    if (!signal || !startAdvance()) return;
    setLookupFailed(false);
    await findNextQuestion(cardIds, currentIndex + 1, signal)
      .then(applyLookup)
      .catch(() => {
        if (isCurrentQuestion()) setLookupFailed(true);
      })
      .finally(finishAdvance);
  };

  const leave = () => {
    lifetime.current?.abort();
    endSession();
    router.push("/quiz");
  };

  const lookupError = lookupFailed && (
    <div className="flex items-center gap-3 p-3">
      <p role="alert" className="text-sm text-text-secondary">
        {t("quiz.session.load_failed")}
      </p>
      <button
        type="button"
        disabled={advancing}
        className="min-h-11 rounded-radius-lg border border-border px-3 text-sm disabled:opacity-50"
        onClick={() => {
          if (currentQuestion && isCurrentSession) void handleSkip();
          else {
            setLookupFailed(false);
            setRetryAttempt((attempt) => attempt + 1);
          }
        }}
      >
        {t("Retry")}
      </button>
    </div>
  );

  if (sessionCompleted && storedSessionId === sessionId) {
    return (
      <SessionComplete
        progress={sessionProgress}
        elapsed={Math.max(0, sessionEndTime - sessionStartTime)}
        onBack={leave}
      />
    );
  }

  if (!isCurrentSession || !currentQuestion) {
    return (
      <div className="flex h-app items-center justify-center bg-app-page">
        {lookupFailed ? lookupError : (
          <div className="text-text-tertiary text-sm">
            {t("quiz.session.loading")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-app max-w-2xl flex-col overflow-y-auto bg-app-page px-4 py-6 text-text sm:px-6">
      <ProgressBar
        current={currentIndex}
        total={cardIds.length}
        onBack={leave}
        onSkip={handleSkip}
        skipDisabled={advancing}
      />

      {lookupError}
      <QuestionView
        key={currentQuestion.card_id}
        question={currentQuestion}
        sessionId={sessionId}
        fatigueWarning={fatigueWarning}
        onAnswered={handleAnswered}
        isCurrentQuestion={isCurrentQuestion}
        advancing={advancing}
        startAdvance={startAdvance}
        finishAdvance={finishAdvance}
      />
    </div>
  );
}
