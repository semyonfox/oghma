# Quiz Redesign Plan

Status: historical implementation record.

## Goal

Simplify quiz sessions into a focused study flow: remove manual FSRS rating buttons, auto-schedule by correctness, calm the UI, add completion feedback, and show review/streak signals in the calendar.

## Scope

- Map answer correctness to server-side FSRS ratings.
- Track session start/completion state in the quiz store.
- Remove rating buttons from the session page.
- Add continue flow and completion screen.
- Add card preview endpoint to support skipping.
- Simplify progress bar, tags, feedback, stats, and course list visuals.
- Add keyboard shortcuts and leech/fatigue indicators.
- Add review-date API/store state for calendar badges.
- Add i18n keys for new labels.

## Key Files

| Area | Files |
|---|---|
| Session route/page | `src/app/quiz/session/[id]/page.tsx`, session API routes |
| Components | `question-card`, `feedback`, `progress-bar`, `stats-row`, `course-list` |
| State | quiz/session stores |
| Calendar | review-date API and month view |
| Localization | locale JSON files |

## Verification

- Correct answers schedule as "Good"; incorrect answers schedule as "Again".
- Users can complete a session without seeing FSRS internals.
- Skip/continue/completion paths do not corrupt session progress.
- Calendar badges reflect review dates.
- Keyboard shortcuts do not conflict with text input.
