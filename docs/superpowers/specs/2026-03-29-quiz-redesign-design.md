# Quiz Redesign: Simplified Scheduling, Minimal UI, Ogham Identity

**Date**: 2026-03-29
**Status**: Draft

## Summary

Strip the quiz section back to a focused study experience. Remove manual FSRS rating, auto-schedule based on correct/incorrect, redesign all quiz UI to match the app's restrained dark-surface aesthetic, and add a session completion screen with confetti. Replace the fire emoji streak icon with an Ogham stroke symbol that also appears as a badge on the calendar.

## Problem

The current quiz UI uses a different visual language from the rest of the app — bright semantic colors on every element (amber, teal, blue, green, red), fire emoji badges, and 4-button FSRS rating after every question. It feels gamified and AI-generated rather than minimal and focused. There's also no session completion screen, and confetti only fires on rare streak milestones (effectively never seen).

## Changes

### 1. Remove FSRS Rating Buttons — Auto-Rate on Correctness

**Current flow**: Answer → Feedback → Pick Again/Hard/Good/Easy → Next question

**New flow**: Answer → Feedback → "Continue" → Next question

Auto-rating logic:

- **Correct answer** → rate as `Good` (3) → FSRS advances the card to its next interval (1d → ~3d → ~1w → ~2w → ~1mo, etc.)
- **Incorrect answer** → rate as `Again` (1) → FSRS resets the card to ~1 day (user sees it tomorrow)

**Files changed**:

- `src/components/quiz/rating-buttons.tsx` — delete entirely
- `src/app/quiz/session/[id]/page.tsx` — replace rating flow with auto-rate on answer submission; add a "Continue" button in the feedback area
- `src/app/api/quiz/sessions/[id]/answer/route.ts` — accept `wasCorrect` and auto-compute rating server-side (correct=3, incorrect=1) instead of requiring `rating` from the client

The API change means the client no longer sends `rating`. The server derives it:

```
rating = wasCorrect ? 3 : 1
```

The `rating` field in the request body becomes optional/ignored. The `quiz_reviews` table still records the computed rating for analytics.

**"Continue" button** (replaces rating buttons in the feedback area):

- Styling: `bg-surface-elevated border border-border-subtle text-text-secondary text-sm px-6 py-2.5 rounded-lg hover:bg-white/10 transition-colors`
- Centered below the feedback card
- Responds to `Enter` / `Space` keypress

### 2. UI Redesign — Muted, Typographic, Minimal

**Design principle**: Color is reserved for exactly two states — correct (subtle green) and incorrect (subtle red). Everything else uses the text hierarchy and surface layers.

#### 2a. Stats Row (`stats-row.tsx`)

- All stat values: `text-text font-bold` (no color-coding)
- All stat labels: `text-text-tertiary text-[10px] uppercase tracking-wider`
- Card backgrounds: `bg-surface border border-border-subtle rounded-lg`
- Remove the conditional color logic for mastery thresholds

#### 2b. Course List (`course-list.tsx`)

- Mastery percentage: `text-text-secondary font-medium` (no color)
- Progress bar track: `bg-surface-elevated`
- Progress bar fill: `bg-text-tertiary` (monochrome gray)
- Remove `getMasteryColor()` and `getBarColor()` functions
- Due count: `text-text-tertiary` always (remove red highlight for `dueCount > 0`)

#### 2c. Question Card (`question-card.tsx`)

- Bloom level tag: `bg-surface-elevated text-text-tertiary` (no teal)
- Module name tag: `bg-surface-elevated text-text-tertiary` (no blue)
- Selected MCQ option: `border-text-tertiary bg-white/5` (no teal)
- Correct option post-answer: `border-success-500/20 bg-success-500/3`
- Incorrect option post-answer: `border-error-500/20 bg-error-500/3`
- Submit button: `bg-surface-elevated border border-border-subtle text-text hover:bg-white/10` (muted, not teal)

#### 2d. Feedback Card (`feedback.tsx`)

- Correct: `border-success-500/15 bg-success-500/3` with `text-text-secondary` for the header
- Incorrect: `border-error-500/15 bg-error-500/3` with `text-text-secondary` for the header
- Explanation text: `text-text-tertiary`
- Replace checkmark/X emoji with simple "Correct" / "Incorrect" text

#### 2e. Progress Bar (`progress-bar.tsx`)

- Bar fill: `bg-text-tertiary` (gray, not teal)
- Bar track: `bg-surface`
- Remove the inline streak fire emoji badge entirely from the session progress bar
- Keep the `current/total` counter in `text-text-tertiary`

#### 2f. Streak Display (`streak-display.tsx`)

- Remove from the dashboard header as a standalone component
- Streak becomes a plain number in the stats row grid alongside mastery, due count, etc.
- No fire emoji. No amber background.
- Icon: Ogham stroke character `ᚑ` in `text-text-tertiary` next to the number
- Label: "Day Streak" in the same `text-[10px] uppercase tracking-wider text-text-tertiary` as other stat labels

#### 2g. Dashboard Header (`dashboard.tsx`)

- Remove `<StreakDisplay />` from the header flex row
- "Start Review" button: keep as `bg-secondary-500` (the one teal accent — consistent with the app's primary action buttons elsewhere)

### 3. Session Completion Screen

**Currently missing** — session end just navigates to `/quiz`. Add a completion view rendered on the session page itself (no navigation).

**Structure**:

```
[Centered card, max-w-md mx-auto]
  "Session Complete"          — font-serif text-text text-xl
  "15 of 20 correct"         — text-text-secondary text-sm, mt-2

  [Stat grid, 2 cols, mt-6]
    Time taken: "12 min"      — text-text font-medium / text-text-tertiary label
    Cards advancing: "15"     — text-text font-medium / text-text-tertiary label
    Cards for tomorrow: "5"   — text-text font-medium / text-text-tertiary label
    Accuracy: "75%"           — text-text font-medium / text-text-tertiary label

  [Back to Dashboard button, mt-8]
    bg-surface-elevated border border-border-subtle text-text-secondary
    hover:bg-white/10
```

**Confetti**: fires once when the completion view mounts. 80 particles, 60 spread, `origin: { y: 0.5 }`.

**Data**: completion stats come from `sessionProgress` already tracked in Zustand (answered, total, correct). Time taken = `Date.now() - sessionStartTime` (add `sessionStartTime` to the store on session start).

**Files changed**:

- `src/app/quiz/session/[id]/page.tsx` — add completion state and render completion card instead of navigating away
- `src/lib/notes/state/quiz.ts` — add `sessionStartTime` field, set on `startSession()`

### 4. Confetti Relocation

- **Remove** from `streak-display.tsx` (delete the `canvas-confetti` import and milestone effect)
- **Add** to session completion view only
- Specs: `confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 } })`
- One burst, no repeat

### 5. Ogham Streak Badge on Calendar

Add a small Ogham stroke `ᚑ` indicator on calendar day cells where the user completed at least one quiz review.

**Data source**: The `quiz_streaks` table already tracks `last_review_date`. But for calendar badges we need per-day review data. Query `quiz_reviews` grouped by date:

```sql
SELECT DATE(created_at) as review_date
FROM app.quiz_reviews
WHERE user_id = $1
  AND created_at >= $2
  AND created_at <= $3
GROUP BY DATE(created_at)
```

**API change**: Add an optional `reviewDates` field to the time-blocks API response (or a new `/api/quiz/review-dates?start=X&end=Y` endpoint). Preference: new lightweight endpoint to keep concerns separated.

**New endpoint**: `GET /api/quiz/review-dates?start=YYYY-MM-DD&end=YYYY-MM-DD`

- Returns `{ dates: string[] }` — array of ISO date strings where user reviewed at least one card

**Calendar integration** (`month-view.tsx`):

- Fetch review dates when the calendar month changes
- On each day cell, if the date is in the review dates set, render a small Ogham stroke indicator
- Position: top-right corner of the day cell, subtle
- Styling: `text-[9px] text-text-tertiary opacity-60` — the `ᚑ` character, barely there, visible on inspection
- Does not interfere with existing assignment/time-block badges

**Files changed**:

- New: `src/app/api/quiz/review-dates/route.ts`
- `src/components/calendar/month-view.tsx` — fetch review dates, render badge
- `src/lib/notes/state/calendar.zustand.ts` — add `reviewDates: Set<string>` and `fetchReviewDates()` action

### 6. Additional Fixes

#### 6a. Leech Card Indicator

The API already returns `isLeech` when a card has 4+ lapses. Show it in the UI.

After the feedback card, if `isLeech` is true, render:

```
<p className="text-text-tertiary text-xs mt-2">
  This card keeps coming back — consider reviewing the source material.
</p>
```

No color, no icon. Just a quiet note.

**Files changed**: `src/app/quiz/session/[id]/page.tsx`

#### 6b. Keyboard Shortcuts

- MCQ options: press `1`/`2`/`3`/`4` (or `A`/`B`/`C`/`D`) to select
- Submit: `Enter` when an option is selected
- Continue after feedback: `Enter` or `Space`

**Files changed**: `src/components/quiz/question-card.tsx`, `src/app/quiz/session/[id]/page.tsx`

#### 6c. Skip Button

Add a "Skip" text button next to the progress counter. Skips the current card without recording a review — advances to the next card in the session.

Styling: `text-text-tertiary text-xs hover:text-text-secondary` (same as the Back button).

**Files changed**: `src/components/quiz/progress-bar.tsx`, `src/app/quiz/session/[id]/page.tsx`

## Files Summary

| File                                             | Action                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `src/components/quiz/rating-buttons.tsx`         | Delete                                                       |
| `src/components/quiz/streak-display.tsx`         | Gut and simplify (becomes stats row item)                    |
| `src/components/quiz/stats-row.tsx`              | Strip colors, add streak stat                                |
| `src/components/quiz/course-list.tsx`            | Strip colors, monochrome bars                                |
| `src/components/quiz/question-card.tsx`          | Mute tags/states, add keyboard shortcuts                     |
| `src/components/quiz/feedback.tsx`               | Reduce color intensity                                       |
| `src/components/quiz/progress-bar.tsx`           | Gray bar, remove streak badge, add skip                      |
| `src/components/quiz/dashboard.tsx`              | Remove StreakDisplay from header                             |
| `src/app/quiz/session/[id]/page.tsx`             | Auto-rate flow, completion screen, leech indicator, keyboard |
| `src/app/api/quiz/sessions/[id]/answer/route.ts` | Server-side auto-rating                                      |
| `src/lib/notes/state/quiz.ts`                    | Add sessionStartTime, completion state                       |
| `src/app/api/quiz/review-dates/route.ts`         | New endpoint for calendar badges                             |
| `src/components/calendar/month-view.tsx`         | Render Ogham streak badges                                   |
| `src/lib/notes/state/calendar.zustand.ts`        | Add reviewDates state + fetch                                |

## Out of Scope

- Changing the FSRS algorithm itself (ts-fsrs default params are fine)
- Bloom's taxonomy auto-progression logic (stays as-is, just hidden from UI emphasis)
- Question generation (LLM pipeline unchanged)
- Dashboard layout structure (just restyling existing components)
- Week view calendar changes (month view only for streak badges)
