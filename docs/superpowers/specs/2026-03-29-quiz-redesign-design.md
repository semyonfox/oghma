# Quiz Redesign Spec

Status: historical design record.

## Intent

Make quiz sessions simpler, less visually noisy, and more study-focused.

## Decisions

- Remove manual FSRS rating buttons from the learner flow.
- Auto-rate reviews from correctness.
- Add a completion screen and move celebration to completion.
- Use muted, typographic UI for question, feedback, stats, and course list surfaces.
- Add skip support with card preview.
- Add keyboard shortcuts.
- Show leech/fatigue signals without overwhelming the session.
- Add Ogham-style review/streak indicators to calendar surfaces.

## Out Of Scope

- Changing the FSRS library itself.
- Rebuilding quiz generation from scratch.
- Full analytics redesign.

## Verification

- Session progress and scheduling remain correct.
- Keyboard shortcuts are accessible and do not interfere with inputs.
- Calendar indicators match review dates.
