# Quiz Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the quiz to a minimal, focused study experience — remove FSRS rating buttons, auto-schedule by correctness, redesign all UI to match the app's dark-surface aesthetic, add session completion with confetti, and add Ogham streak badges to the calendar.

**Architecture:** Server-side auto-rating replaces client-side FSRS rating. All quiz UI components get restyled to use the text hierarchy instead of semantic colors. A new `/api/quiz/review-dates` endpoint feeds Ogham `ᚑ` badges into the calendar month view. Session completion renders in-page instead of navigating away.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Zustand, ts-fsrs, canvas-confetti, postgres.js

---

### Task 1: Server-Side Auto-Rating

Replace client-driven FSRS rating with server-derived rating based on `wasCorrect`.

**Files:**

- Modify: `src/app/api/quiz/sessions/[id]/answer/route.ts`

- [ ] **Step 1: Update the answer route to derive rating from wasCorrect**

In `src/app/api/quiz/sessions/[id]/answer/route.ts`, change the destructuring and rating logic. Replace:

```typescript
const { cardId, rating, userAnswer, wasCorrect, responseTimeMs, nextCardId } =
  body;

if (!cardId || !rating)
  return tracedError("cardId and rating are required", 400);
```

With:

```typescript
const { cardId, userAnswer, wasCorrect, responseTimeMs, nextCardId } = body;

if (!cardId || wasCorrect === undefined)
  return tracedError("cardId and wasCorrect are required", 400);

// auto-rate: correct = Good (3), incorrect = Again (1)
const rating = wasCorrect ? 3 : 1;
```

Everything below this point in the file stays the same — the `rating` variable is used identically by the FSRS logic and the review insert.

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run src/__tests__/lib/quiz/`
Expected: All quiz tests pass (the API route isn't directly unit-tested, but fsrs/select/bloom tests should still pass).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/quiz/sessions/\[id\]/answer/route.ts
git commit -m "feat(quiz): auto-rate answers server-side based on correctness"
```

---

### Task 2: Zustand Store — Session Start Time and Completion State

Add `sessionStartTime` and `sessionCompleted` to the quiz store so the session page can show a completion screen with elapsed time.

**Files:**

- Modify: `src/lib/notes/state/quiz.ts`

- [ ] **Step 1: Add sessionStartTime and sessionCompleted to the store**

In `src/lib/notes/state/quiz.ts`, add to the `QuizState` interface after `fatigueWarning: boolean;`:

```typescript
sessionStartTime: number;
sessionCompleted: boolean;
```

Add to the initial state in the `create` call after `fatigueWarning: false,`:

```typescript
sessionStartTime: 0,
sessionCompleted: false,
```

In the `startSession` action, add `sessionStartTime: Date.now()` and `sessionCompleted: false` to the set call:

```typescript
startSession: (sessionId, cardIds, question) => set({
    sessionId,
    cardIds,
    currentIndex: 0,
    currentQuestion: question,
    sessionProgress: { answered: 0, total: cardIds.length, correct: 0 },
    fatigueWarning: false,
    sessionStartTime: Date.now(),
    sessionCompleted: false,
}),
```

Add a `completeSession` action to the interface after `endSession`:

```typescript
completeSession: () => void;
```

Add the implementation after the `endSession` action:

```typescript
completeSession: () => set({ sessionCompleted: true }),
```

In the `endSession` action, also reset the new fields:

```typescript
endSession: () => set({
    sessionId: null,
    cardIds: [],
    currentIndex: 0,
    currentQuestion: null,
    sessionProgress: { answered: 0, total: 0, correct: 0 },
    fatigueWarning: false,
    sessionStartTime: 0,
    sessionCompleted: false,
}),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notes/state/quiz.ts
git commit -m "feat(quiz): add sessionStartTime and completion state to store"
```

---

### Task 3: Session Page — Remove Rating Buttons, Add Continue Flow and Completion Screen

Rewrite the session page to use auto-rating, a Continue button, a session completion view with confetti, leech indicator, and keyboard shortcuts.

**Files:**

- Modify: `src/app/quiz/session/[id]/page.tsx`
- Delete: `src/components/quiz/rating-buttons.tsx`

- [ ] **Step 1: Delete rating-buttons.tsx**

```bash
rm src/components/quiz/rating-buttons.tsx
```

- [ ] **Step 2: Rewrite the session page**

Replace the entire contents of `src/app/quiz/session/[id]/page.tsx` with:

```tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
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

  useEffect(() => {
    if (!confettiRef.current) {
      confettiRef.current = true;
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 } });
      });
    }
  }, []);

  const minutes = Math.max(1, Math.round(elapsed / 60000));
  const accuracy =
    progress.answered > 0
      ? Math.round((progress.correct / progress.answered) * 100)
      : 0;
  const advancing = progress.correct;
  const forTomorrow = progress.answered - progress.correct;

  return (
    <div className="h-screen flex items-center justify-center px-6">
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
            <div
              key={stat.label}
              className="bg-surface border border-border-subtle rounded-lg p-3"
            >
              <div className="text-text-tertiary text-[10px] uppercase tracking-wider">
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
          className="mt-8 bg-surface-elevated border border-border-subtle text-text-secondary text-sm px-6 py-2.5 rounded-lg hover:bg-white/10 transition-colors"
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
  const startTimeRef = useRef(Date.now());

  const handleAnswer = useCallback((answer: string, wasCorrect: boolean) => {
    setAnswered(true);
    setLastAnswer({ answer, wasCorrect });
  }, []);

  const handleContinue = useCallback(async () => {
    if (!lastAnswer) return;

    const nextCardId =
      currentIndex + 1 < cardIds.length ? cardIds[currentIndex + 1] : null;
    const responseTimeMs = Date.now() - startTimeRef.current;

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
        <div className="mt-4 bg-surface border border-border-subtle rounded-lg p-3 text-xs text-text-tertiary">
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
                className="bg-surface-elevated border border-border-subtle text-text-secondary text-sm px-6 py-2.5 rounded-lg hover:bg-white/10 transition-colors"
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
    sessionCompleted,
    fatigueWarning,
    startSession,
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
        .then((r) => r.json())
        .then((data) => {
          if (data.cardIds) {
            startSession(sessionId, data.cardIds, data.question);
          }
        });
    }
  }, [sessionId, cardIds.length, startSession]);

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
    const elapsed = Date.now() - sessionStartTime;
    return (
      <SessionComplete
        progress={sessionProgress}
        elapsed={elapsed}
        onBack={() => {
          endSession();
          router.push("/quiz");
        }}
      />
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-text-tertiary text-sm">
          {t("quiz.session.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col px-6 py-6 max-w-2xl mx-auto">
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
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(quiz): replace rating buttons with auto-rate Continue flow and completion screen"
```

---

### Task 4: Card Preview Endpoint (for Skip)

A lightweight endpoint to fetch question data for a specific card ID, used by the skip handler.

**Files:**

- Create: `src/app/api/quiz/cards/[id]/route.ts`

- [ ] **Step 1: Create the card preview endpoint**

Create `src/app/api/quiz/cards/[id]/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id: cardId } = await params;
    const rows = await sql`
      SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
             qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qc.question_id = qq.id
      WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${user.user_id}::uuid
    `;

    if (!rows[0]) return tracedError("Card not found", 404);

    return NextResponse.json({ question: rows[0] });
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quiz/cards/\[id\]/route.ts
git commit -m "feat(quiz): add card preview endpoint for skip functionality"
```

---

### Task 5: Progress Bar — Gray Fill, Remove Streak Badge, Add Skip

**Files:**

- Modify: `src/components/quiz/progress-bar.tsx`

- [ ] **Step 1: Rewrite progress-bar.tsx**

Replace the entire contents of `src/components/quiz/progress-bar.tsx` with:

```tsx
"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface ProgressBarProps {
  current: number;
  total: number;
  onBack: () => void;
  streak: number;
  onSkip?: () => void;
}

export default function ProgressBar({
  current,
  total,
  onBack,
  streak: _streak,
  onSkip,
}: ProgressBarProps) {
  const { t } = useI18n();
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
      >
        {t("quiz.progress.back")}
      </button>
      <div className="flex-1 h-1 bg-surface rounded-full">
        <div
          className="h-full bg-text-tertiary rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-text-tertiary text-xs">
        {current}/{total}
      </span>
      {onSkip && (
        <button
          onClick={onSkip}
          className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
        >
          {t("quiz.progress.skip")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/progress-bar.tsx
git commit -m "style(quiz): gray progress bar, remove streak badge, add skip button"
```

---

### Task 6: Question Card — Muted Tags, Muted States, Keyboard Shortcuts

**Files:**

- Modify: `src/components/quiz/question-card.tsx`

- [ ] **Step 1: Rewrite question-card.tsx**

Replace the entire contents of `src/components/quiz/question-card.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { BLOOM_NAMES } from "@/lib/quiz/types";
import type { BloomLevel } from "@/lib/quiz/types";

interface QuestionCardProps {
  question: {
    question_text: string;
    question_type: string;
    bloom_level: BloomLevel;
    options: { text: string; is_correct: boolean }[] | null;
    correct_answer: string;
  };
  moduleName?: string;
  onAnswer: (answer: string, wasCorrect: boolean) => void;
}

export default function QuestionCard({
  question,
  moduleName,
  onAnswer,
}: QuestionCardProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const [fillInAnswer, setFillInAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleMCQSelect = (index: number) => {
    if (submitted) return;
    setSelected(index);
  };

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);

    if (question.question_type === "fill_in") {
      const correct =
        fillInAnswer.trim().toLowerCase() ===
        question.correct_answer.trim().toLowerCase();
      onAnswer(fillInAnswer, correct);
    } else if (selected !== null && question.options) {
      const isCorrect = question.options[selected].is_correct;
      onAnswer(question.options[selected].text, isCorrect);
    }
  }, [submitted, question, fillInAnswer, selected, onAnswer]);

  // keyboard shortcuts for MCQ selection and submission
  useEffect(() => {
    if (submitted) return;
    const handler = (e: KeyboardEvent) => {
      // ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (question.options) {
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= question.options.length) {
          e.preventDefault();
          setSelected(numKey - 1);
          return;
        }
        const letterIdx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx < question.options.length) {
          e.preventDefault();
          setSelected(letterIdx);
          return;
        }
      }
      if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, question.options, selected, handleSubmit]);

  return (
    <div className="flex-1 flex flex-col justify-center gap-5">
      {/* tags */}
      <div className="flex gap-2 items-center">
        <span className="bg-surface-elevated text-text-tertiary px-2.5 py-0.5 rounded text-[10px] font-medium">
          {BLOOM_NAMES[question.bloom_level]}
        </span>
        {moduleName && (
          <span className="bg-surface-elevated text-text-tertiary px-2.5 py-0.5 rounded text-[10px]">
            {moduleName}
          </span>
        )}
      </div>

      {/* question text */}
      <h2 className="text-text text-lg font-medium leading-relaxed">
        {question.question_text}
      </h2>

      {/* MCQ / True-False options */}
      {question.options && (
        <div className="flex flex-col gap-2">
          {question.options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            let borderColor = "border-border-subtle";
            let bgColor = "bg-surface";

            if (submitted) {
              if (option.is_correct) {
                borderColor = "border-success-500/20";
                bgColor = "bg-success-500/3";
              } else if (i === selected && !option.is_correct) {
                borderColor = "border-error-500/20";
                bgColor = "bg-error-500/3";
              }
            } else if (i === selected) {
              borderColor = "border-text-tertiary";
              bgColor = "bg-white/5";
            }

            return (
              <button
                key={i}
                onClick={() => handleMCQSelect(i)}
                disabled={submitted}
                className={`${bgColor} border ${borderColor} rounded-lg px-4 py-3 text-sm text-left flex items-center gap-3 transition-colors ${!submitted ? "hover:border-text-tertiary cursor-pointer" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${
                    i === selected
                      ? submitted
                        ? option.is_correct
                          ? "bg-success-500/20 border-success-500/30 text-text-secondary"
                          : "bg-error-500/20 border-error-500/30 text-text-secondary"
                        : "bg-white/10 border-text-tertiary text-text-secondary"
                      : submitted && option.is_correct
                        ? "bg-success-500/20 border-success-500/30 text-text-secondary"
                        : "border-border-subtle text-text-tertiary"
                  }`}
                >
                  {letter}
                </div>
                <span
                  className={
                    submitted && option.is_correct
                      ? "text-text"
                      : i === selected && submitted && !option.is_correct
                        ? "text-text-tertiary line-through"
                        : "text-text-secondary"
                  }
                >
                  {option.text}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fill-in-the-blank */}
      {question.question_type === "fill_in" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={fillInAnswer}
            onChange={(e) => setFillInAnswer(e.target.value)}
            disabled={submitted}
            placeholder={t("quiz.question.type_answer")}
            className="flex-1 bg-surface border border-border-subtle rounded-lg px-4 py-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
            onKeyDown={(e) =>
              e.key === "Enter" &&
              !submitted &&
              fillInAnswer.trim() &&
              handleSubmit()
            }
          />
        </div>
      )}

      {/* submit button */}
      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={
            (question.options && selected === null) ||
            (question.question_type === "fill_in" && !fillInAnswer.trim())
          }
          className="bg-surface-elevated border border-border-subtle text-text px-6 py-2.5 rounded-lg text-sm font-medium self-center hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("quiz.question.check_answer")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/question-card.tsx
git commit -m "style(quiz): muted question card tags/states, add keyboard shortcuts"
```

---

### Task 7: Feedback Card — Subtle Tints

**Files:**

- Modify: `src/components/quiz/feedback.tsx`

- [ ] **Step 1: Rewrite feedback.tsx**

Replace the entire contents of `src/components/quiz/feedback.tsx` with:

```tsx
"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface FeedbackProps {
  wasCorrect: boolean;
  explanation: string;
  correctAnswer: string;
}

export default function Feedback({
  wasCorrect,
  explanation,
  correctAnswer,
}: FeedbackProps) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-lg p-4 border ${wasCorrect ? "bg-success-500/3 border-success-500/15" : "bg-error-500/3 border-error-500/15"}`}
    >
      <div className="text-sm font-medium mb-2 text-text-secondary">
        {wasCorrect ? t("quiz.feedback.correct") : t("quiz.feedback.incorrect")}
      </div>
      {!wasCorrect && (
        <div className="text-xs text-text-secondary mb-2">
          {t("quiz.feedback.correct_answer")}{" "}
          <span className="text-text font-medium">{correctAnswer}</span>
        </div>
      )}
      <div className="text-xs text-text-tertiary leading-relaxed">
        {explanation}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/feedback.tsx
git commit -m "style(quiz): subtle feedback card tints, remove emoji markers"
```

---

### Task 8: Stats Row — Strip Colors, Add Streak with Ogham

**Files:**

- Modify: `src/components/quiz/stats-row.tsx`

- [ ] **Step 1: Rewrite stats-row.tsx**

Replace the entire contents of `src/components/quiz/stats-row.tsx` with:

```tsx
"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface StatsRowProps {
  mastery: number;
  dueCount: number;
  reviewedToday: number;
  weekAccuracy: number;
  currentStreak?: number;
}

export default function StatsRow({
  mastery,
  dueCount,
  reviewedToday,
  weekAccuracy,
  currentStreak,
}: StatsRowProps) {
  const { t } = useI18n();
  const statCards = [
    { label: t("quiz.stats.overall_mastery"), value: `${mastery}%` },
    { label: t("quiz.stats.due_today"), value: String(dueCount) },
    { label: t("quiz.stats.reviewed_today"), value: String(reviewedToday) },
    { label: t("quiz.stats.accuracy_7d"), value: `${weekAccuracy}%` },
  ];

  if (currentStreak !== undefined) {
    statCards.push({
      label: t("quiz.stats.day_streak"),
      value: `ᚑ ${currentStreak}`,
    });
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="bg-surface border border-border-subtle rounded-lg p-4"
        >
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider">
            {stat.label}
          </div>
          <div className="text-text text-2xl font-bold mt-1">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/stats-row.tsx
git commit -m "style(quiz): monochrome stats row with Ogham streak indicator"
```

---

### Task 9: Course List — Strip Colors, Monochrome Bars

**Files:**

- Modify: `src/components/quiz/course-list.tsx`

- [ ] **Step 1: Rewrite course-list.tsx**

Replace the entire contents of `src/components/quiz/course-list.tsx` with:

```tsx
"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

interface Course {
  courseId: number;
  courseName: string;
  totalCards: number;
  dueCount: number;
  mastery: number;
}

interface CourseListProps {
  courses: Course[];
  onSelectCourse: (courseId: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function CourseList({
  courses,
  onSelectCourse,
  searchQuery,
  onSearchChange,
}: CourseListProps) {
  const { t } = useI18n();
  const filtered = courses.filter((c) =>
    c.courseName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-text font-semibold text-sm">{t("Courses")}</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("quiz.courses.search_placeholder")}
          className="bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary w-48"
        />
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map((course) => (
          <button
            key={course.courseId}
            onClick={() => onSelectCourse(course.courseId)}
            className="bg-surface border border-border-subtle rounded-lg p-3 flex items-center gap-3 hover:bg-surface-elevated transition-colors text-left w-full"
          >
            <div className="flex-1 min-w-0">
              <div className="text-text text-sm font-medium truncate">
                {course.courseName}
              </div>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-text-tertiary">
                  {t("quiz.courses.due_count", { count: course.dueCount })}
                </span>
                <span className="text-text-tertiary">
                  {t("quiz.courses.total_count", { count: course.totalCards })}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-text-secondary text-sm font-medium">
                {course.mastery}%
              </div>
              <div className="w-12 h-1 bg-surface-elevated rounded-full mt-1">
                <div
                  className="h-full rounded-full bg-text-tertiary"
                  style={{ width: `${course.mastery}%` }}
                />
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-text-tertiary text-sm text-center py-8">
            {courses.length === 0
              ? t("quiz.courses.no_content")
              : t("quiz.courses.no_matches")}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/course-list.tsx
git commit -m "style(quiz): monochrome course list, neutral mastery bars"
```

---

### Task 10: Dashboard — Remove StreakDisplay, Pass Streak to StatsRow

**Files:**

- Modify: `src/components/quiz/dashboard.tsx`
- Delete: `src/components/quiz/streak-display.tsx`

- [ ] **Step 1: Delete streak-display.tsx**

```bash
rm src/components/quiz/streak-display.tsx
```

- [ ] **Step 2: Rewrite dashboard.tsx**

Replace the entire contents of `src/components/quiz/dashboard.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useQuizStore from "@/lib/notes/state/quiz";
import useI18n from "@/lib/notes/hooks/use-i18n";
import StatsRow from "./stats-row";
import CourseList from "./course-list";

export default function QuizDashboard() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    dashboardData,
    courses,
    dashboardLoading,
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
  } = useQuizStore();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function load() {
      setDashboardLoading(true);
      try {
        const [dashRes, coursesRes] = await Promise.all([
          fetch("/api/quiz/dashboard"),
          fetch("/api/quiz/dashboard/courses"),
        ]);
        if (dashRes.ok) setDashboard(await dashRes.json());
        if (coursesRes.ok) {
          const data = await coursesRes.json();
          setCourses(data.courses);
        }
      } catch {
        // network or parse error — fallback handled below
      } finally {
        if (!useQuizStore.getState().dashboardData) {
          setDashboard({
            dueCount: 0,
            totalCards: 0,
            mastery: 0,
            reviewedToday: 0,
            weekAccuracy: 0,
            currentStreak: 0,
            longestStreak: 0,
          });
        }
        setDashboardLoading(false);
      }
    }
    load();
  }, [setDashboard, setCourses, setDashboardLoading]);

  const startReview = async (filterType: string, filterValue?: unknown) => {
    const res = await fetch("/api/quiz/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filterType, filterValue }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.cardIds && data.question) {
      startSession(data.sessionId, data.cardIds, data.question);
    }
    router.push(`/quiz/session/${data.sessionId}`);
  };

  if (dashboardLoading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-tertiary text-sm">{t("quiz.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-text text-xl font-bold">{t("quiz.title")}</h1>
          <p className="text-text-tertiary text-xs mt-1">
            {t("quiz.cards_due_summary", {
              dueCount: dashboardData.dueCount,
              totalCards: dashboardData.totalCards,
            })}
          </p>
        </div>
        <button
          onClick={() => startReview("all")}
          disabled={dashboardData.dueCount === 0}
          className="bg-secondary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("Start Review")}
        </button>
      </div>

      <StatsRow
        mastery={dashboardData.mastery}
        dueCount={dashboardData.dueCount}
        reviewedToday={dashboardData.reviewedToday}
        weekAccuracy={dashboardData.weekAccuracy}
        currentStreak={dashboardData.currentStreak}
      />

      <div className="mt-6">
        <CourseList
          courses={courses}
          onSelectCourse={(courseId) => startReview("course", courseId)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style(quiz): remove StreakDisplay component, integrate streak into stats row"
```

---

### Task 11: Review Dates API Endpoint for Calendar Badges

**Files:**

- Create: `src/app/api/quiz/review-dates/route.ts`

- [ ] **Step 1: Create the review-dates endpoint**

Create `src/app/api/quiz/review-dates/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return tracedError("start and end query parameters are required", 400);
  }

  const rows = await sql`
    SELECT DISTINCT DATE(created_at) as review_date
    FROM app.quiz_reviews
    WHERE user_id = ${user.user_id}::uuid
      AND created_at >= ${start}::date
      AND created_at < ${end}::date + interval '1 day'
    ORDER BY review_date
  `;

  return NextResponse.json({
    dates: rows.map((r: any) => r.review_date),
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quiz/review-dates/route.ts
git commit -m "feat(quiz): add review-dates API endpoint for calendar badges"
```

---

### Task 12: Calendar Store — Add Review Dates State

**Files:**

- Modify: `src/lib/notes/state/calendar.zustand.ts`

- [ ] **Step 1: Add reviewDates to the calendar store**

In `src/lib/notes/state/calendar.zustand.ts`, add to the `CalendarState` interface after `loading: boolean;`:

```typescript
reviewDates: Set<string>;
fetchReviewDates: (start: string, end: string) => Promise<void>;
```

Add to the initial state inside the `persist` callback after `loading: false,`:

```typescript
reviewDates: new Set<string>(),
```

Add the fetch action after the `deleteTimeBlock` action (before the closing `}`):

```typescript
fetchReviewDates: async (start, end) => {
  try {
    const res = await fetch(
      `/api/quiz/review-dates?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    set({ reviewDates: new Set(data.dates) });
  } catch {
    // silent
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notes/state/calendar.zustand.ts
git commit -m "feat(calendar): add reviewDates state and fetch action to store"
```

---

### Task 13: Calendar Month View — Render Ogham Streak Badges

**Files:**

- Modify: `src/components/calendar/month-view.tsx`

- [ ] **Step 1: Add reviewDates fetch and DayCell interface update**

In `src/components/calendar/month-view.tsx`, add `reviewDates` and `fetchReviewDates` to the destructured store values. Change:

```typescript
const {
  currentDate,
  selectedDate,
  setSelectedDate,
  timeBlocks,
  fetchTimeBlocks,
} = useCalendarStore();
```

To:

```typescript
const {
  currentDate,
  selectedDate,
  setSelectedDate,
  timeBlocks,
  fetchTimeBlocks,
  reviewDates,
  fetchReviewDates,
} = useCalendarStore();
```

- [ ] **Step 2: Add reviewDates fetch alongside timeBlocks fetch**

After the existing `fetchTimeBlocks` useEffect (the one at line ~105-111), add a new useEffect:

```typescript
// fetch quiz review dates for streak badges
useEffect(() => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const start = `${year}-${String(month).padStart(2, "0")}-20`;
  const endDate = new Date(year, month + 2, 10);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  fetchReviewDates(start, end);
}, [anchor, fetchReviewDates]);
```

- [ ] **Step 3: Add Ogham badge to day cells**

Inside the day cell button, right after the `<time>` element and before the `{/* events */}` comment, add:

```tsx
{
  /* Ogham streak badge */
}
{
  reviewDates.has(day.date) && (
    <span className="absolute top-1 right-1.5 text-[9px] text-text-tertiary opacity-60 leading-none">
      ᚑ
    </span>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/month-view.tsx
git commit -m "feat(calendar): render Ogham streak badges on days with quiz reviews"
```

---

### Task 14: Add i18n Keys for New UI Text

**Files:**

- Modify: `src/locales/en.json`

- [ ] **Step 1: Add new keys to the English locale file**

In `src/locales/en.json`, find the existing quiz keys section and add these new keys:

```json
"quiz.complete.title": "Session Complete",
"quiz.complete.score": "{correct} of {total} correct",
"quiz.complete.time": "Time Taken",
"quiz.complete.accuracy": "Accuracy",
"quiz.complete.advancing": "Cards Advancing",
"quiz.complete.for_tomorrow": "Cards for Tomorrow",
"quiz.complete.back": "Back to Dashboard",
"quiz.session.continue": "Continue",
"quiz.session.leech_warning": "This card keeps coming back — consider reviewing the source material.",
"quiz.progress.skip": "Skip",
"quiz.stats.day_streak": "Day Streak"
```

- [ ] **Step 2: Commit**

```bash
git add src/locales/
git commit -m "feat(i18n): add quiz completion and session UI translation keys"
```

---

### Task 15: Build Verification

- [ ] **Step 1: Run the test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors. (The dev server is running separately, don't restart it.)

- [ ] **Step 3: Fix any issues found**

If any TypeScript errors or test failures, fix them and recommit.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(quiz): resolve build/test issues from quiz redesign"
```
