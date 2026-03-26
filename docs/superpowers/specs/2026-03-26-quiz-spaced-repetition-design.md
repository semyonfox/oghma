# Quiz System with Spaced Repetition — Design Spec

## Context

OghmaNotes imports lecture content from Canvas LMS, chunks it, and embeds it for RAG-based AI chat. Students currently have no way to actively test their knowledge against this material. This feature adds a quiz system grounded in learning science: FSRS spaced repetition for optimal review timing, Bloom's taxonomy for difficulty escalation, and ZPD principles to keep questions at the student's learning edge — all bounded by the actual module content.

## Architecture Overview

```
Dashboard (/quiz) → Select scope → Full-screen quiz mode → Answer → Feedback → FSRS rate → Next card
     ↑                                                                                          |
     └──────────────────────── Session complete (stats + streak update) ←───────────────────────┘
```

**Key decisions:**
- FSRS (Free Spaced Repetition Scheduler) over SM-2 — trained on real review data, more adaptive
- Seed bank (~5 questions/module) + on-demand generation — instant start, no wasted compute
- Content-bounded Bloom's escalation — difficulty is cognitive demand, never exceeds module scope
- Dashboard-first layout — stats overview landing → focused full-screen quiz mode

## Data Model

### quiz_questions

Stores generated questions. One question per chunk per Bloom's level per user.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → login | |
| note_id | UUID FK → notes | Source note |
| chunk_id | UUID FK → chunks | Specific chunk used |
| question_type | TEXT | `mcq`, `true_false`, `fill_in`, `free_response` |
| bloom_level | INT | 1=remember, 2=understand, 3=apply, 4=analyze |
| question_text | TEXT | The question |
| options | JSONB | For MCQ: `[{text, is_correct}]`, null for others |
| correct_answer | TEXT | Canonical answer |
| explanation | TEXT | Why the answer is correct |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Constraints:** UNIQUE(user_id, chunk_id, bloom_level) — prevents duplicate questions for the same material at the same cognitive level.

### quiz_cards

FSRS state wrapper per question per user. One card per question.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → login | |
| question_id | UUID FK → quiz_questions | |
| state | TEXT | `new`, `learning`, `review`, `relearning` |
| stability | FLOAT | Days until retrievability drops to 90% |
| difficulty | FLOAT | 0-10 intrinsic difficulty |
| elapsed_days | INT | Days since last review |
| scheduled_days | INT | Days until next review |
| reps | INT | Total successful review count |
| lapses | INT | Total fail count (leech at 4+) |
| due | TIMESTAMPTZ | Next review date |
| last_review | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Constraints:** UNIQUE(user_id, question_id)

### quiz_reviews

Full answer history. Many reviews per card over time.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → login | |
| card_id | UUID FK → quiz_cards | |
| question_id | UUID FK → quiz_questions | |
| rating | INT | 1=again, 2=hard, 3=good, 4=easy (FSRS scale) |
| user_answer | TEXT | What the user typed/selected |
| was_correct | BOOLEAN | |
| response_time_ms | INT | Thinking time |
| ai_feedback | TEXT | Scaffolding response (future) |
| session_id | UUID FK → quiz_sessions | |
| created_at | TIMESTAMPTZ | |

### quiz_sessions

One record per study sitting. Tracks session-level stats.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → login | |
| filter_type | TEXT | `course`, `module`, `note`, `search`, `chat_session`, `all` |
| filter_value | JSONB | Course ID, module ID, note IDs array, search query, or chat session ID |
| total_questions | INT | Questions served |
| correct_count | INT | |
| bloom_distribution | JSONB | `{1: 5, 2: 3, 3: 2, 4: 0}` |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | Null if abandoned |

### user_streaks

One row per user. Tracks daily review streaks.

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID PK FK → login | |
| current_streak | INT | Consecutive days with a review |
| longest_streak | INT | All-time best |
| last_review_date | DATE | For streak calculation |
| total_review_days | INT | Lifetime count |
| streak_milestones | JSONB | `[{days: 7, reached_at: "..."}, ...]` |
| updated_at | TIMESTAMPTZ | |

### reward_entries (future — schema only, not built in MVP)

```sql
-- reward_entries
-- id UUID PK
-- user_id UUID FK → login
-- reward_type TEXT (free_ai_day, raffle_entry, voucher)
-- milestone_trigger TEXT (streak_30, streak_365, etc.)
-- status TEXT (earned, redeemed, expired)
-- metadata JSONB (voucher codes, raffle IDs, etc.)
-- created_at TIMESTAMPTZ
-- redeemed_at TIMESTAMPTZ
```

## Question Generation Pipeline

### Filter Resolution

| Filter Type | Resolution |
|-------------|------------|
| `course` | `SELECT c.id FROM app.chunks c JOIN app.notes n ON c.document_id = n.note_id WHERE n.user_id = $1 AND n.canvas_course_id = $2` |
| `module` | Same as course but with `canvas_module_id` |
| `note` | `SELECT id FROM app.chunks WHERE document_id = ANY($1) AND user_id = $2` |
| `search` | Embed query via Cohere → pgvector cosine search → top-N chunk IDs |
| `chat_session` | Get note IDs from `chat_messages.sources` → resolve to chunk IDs |
| `all` | All chunks for user |

### Generation Flow

1. **Resolve filter** → candidate chunk IDs
2. **Check coverage** → which chunks already have questions at the user's current Bloom's level?
3. **Select session cards** using weighted algorithm:
   - 70% due/overdue cards (FSRS `due <= now()`)
   - 20% new cards from uncovered chunks
   - 10% mastered cards (random retention checks)
4. **Generate for uncovered chunks** — send chunk text + target Bloom's level to LLM
5. **Save** question + card to DB
6. **Serve** ordered question set to frontend

### LLM Prompt Template

```
You are generating a study question from university lecture notes.

Content from the student's notes:
---
{chunk_text}
---

Module: {module_name}
Target cognitive level: {bloom_level_name} (Bloom's Taxonomy level {bloom_level})
Question type: {question_type}

Generate a question that:
- Tests ONLY knowledge present in the provided content
- Does NOT introduce concepts beyond this module's scope
- Matches the cognitive level: {bloom_level_description}
- Has exactly one correct answer

Return JSON:
{
  "question_text": "...",
  "options": [{"text": "...", "is_correct": true/false}, ...],  // 4 options for MCQ, null for fill_in
  "correct_answer": "...",
  "explanation": "..."  // 1-2 sentences referencing the source material
}
```

### Bloom's Level Descriptions (for prompt)

| Level | Name | Description | Question Types |
|-------|------|-------------|---------------|
| 1 | Remember | Recall facts, definitions, terms | MCQ, True/False |
| 2 | Understand | Explain concepts, compare ideas | MCQ, True/False, Fill-in |
| 3 | Apply | Use knowledge to solve problems | MCQ, Fill-in |
| 4 | Analyze | Break down, compare, evaluate | MCQ, Fill-in, Free-response (future) |

### Bloom's Escalation Logic

Per-topic mastery tracked by correct answer rate at each level:
- **Advance** to next level when: 3+ consecutive correct at current level, >80% accuracy
- **Maintain** when: mixed results, 50-80% accuracy
- **Scaffold down** when: <50% accuracy — rephrase at current or lower level
- **Ceiling**: level 4 is max. Once mastered at level 4 for all chunks → maintenance mode

## FSRS Implementation

Use the `ts-fsrs` npm package (MIT licensed, TypeScript implementation of FSRS-5).

### Card States

```
New → Learning → Review ← → Relearning
                  ↓
            (if lapsed)
```

### Rating Scale

| Rating | Meaning | Effect |
|--------|---------|--------|
| 1 (Again) | Forgot / wrong | Reset to learning, stability drops |
| 2 (Hard) | Recalled with difficulty | Short interval, slight stability increase |
| 3 (Good) | Normal recall | Standard interval increase |
| 4 (Easy) | Effortless recall | Large interval increase |

### Interval Preview

Show the next review date for each rating button (e.g., "Again: <1min", "Good: 7 days"). Calculated by FSRS before the user clicks.

## Session Regulation

- **Default cap**: 20 questions per session (configurable in settings)
- **Priority**: overdue → due today → new cards
- **Leech detection**: cards with `lapses >= 4` flagged; in MVP, show warning badge
- **Fatigue signal**: >40% wrong in current session → show "consider taking a break" message
- **Load smoothing**: max 30 new cards per day to prevent review cliff after big imports

## UI Design

### Dashboard Landing (/quiz)

Full-width page accessible from new quiz icon in sidebar nav.

**Header**: page title, due count, streak badge, "Start Review" CTA
**Stats row**: 4 cards — overall mastery %, due today, reviewed today, 7-day accuracy
**Course list**: each course shows name, due count, total cards, mastery bar with color coding:
  - Green (>75%): mastered
  - Yellow (50-75%): progressing
  - Red (<50%): needs attention
**Search bar**: semantic search to start a topic-specific quiz
**Module drill-down**: click a course to expand modules with individual mastery bars

### Full-Screen Quiz Mode

Entered by clicking a module, course, or "Start Review".

**Top bar**: back button, progress bar, question count (3/20), streak badge
**Tags**: Bloom's level badge + source module/topic
**Question area**: centered, max-width ~600px for readability
  - MCQ: circular letter indicators (A/B/C/D), selected state highlighted in teal
  - True/False: two large buttons
  - Fill-in: text input with submit button
**Rating buttons**: bottom-aligned, 4 buttons (Again/Hard/Good/Easy) with interval previews

### Feedback (MVP)

After selecting an answer:
- Correct/incorrect badge
- Correct answer highlighted (green)
- Wrong answer struck through (red) if applicable
- 1-2 sentence explanation
- FSRS rating buttons appear

### Streak Display

- Flame icon with day count in dashboard header and quiz top bar
- Milestone celebrations: confetti animation at 7, 30, 90, 365 days
- "Best streak" shown alongside current

## API Routes

```
POST   /api/quiz/sessions          — Start a new quiz session (resolve filter, select cards)
GET    /api/quiz/sessions/:id      — Get session state + current question
POST   /api/quiz/sessions/:id/answer — Submit answer + FSRS rating, get next question
DELETE /api/quiz/sessions/:id      — Abandon session

GET    /api/quiz/dashboard         — Dashboard stats (due counts, mastery, streak)
GET    /api/quiz/dashboard/courses — Course-level breakdown with module drill-down

POST   /api/quiz/generate          — Generate questions for specific chunks (called internally)

GET    /api/quiz/streak             — Current streak info
POST   /api/quiz/streak/check       — Called on first review of the day to update streak
```

## Key Files to Create

```
src/app/quiz/page.tsx                          — Quiz dashboard page
src/app/quiz/session/[id]/page.tsx             — Active quiz session page
src/app/api/quiz/sessions/route.ts             — Session CRUD
src/app/api/quiz/sessions/[id]/route.ts        — Session state
src/app/api/quiz/sessions/[id]/answer/route.ts — Answer submission
src/app/api/quiz/dashboard/route.ts            — Dashboard stats
src/app/api/quiz/dashboard/courses/route.ts    — Course breakdown
src/app/api/quiz/generate/route.ts             — Question generation
src/app/api/quiz/streak/route.ts               — Streak endpoints

src/lib/quiz/fsrs.ts                           — FSRS wrapper (ts-fsrs)
src/lib/quiz/generate.ts                       — LLM question generation
src/lib/quiz/select.ts                         — Weighted card selection algorithm
src/lib/quiz/bloom.ts                          — Bloom's level tracking + escalation

src/lib/notes/state/quiz.ts                    — Zustand store for quiz UI state

src/components/quiz/dashboard.tsx              — Dashboard layout
src/components/quiz/stats-row.tsx              — Stats cards
src/components/quiz/course-list.tsx            — Course/module list
src/components/quiz/question-card.tsx          — Question display (MCQ, T/F, fill-in)
src/components/quiz/rating-buttons.tsx         — FSRS rating buttons with intervals
src/components/quiz/feedback.tsx               — Post-answer feedback
src/components/quiz/streak-display.tsx         — Streak badge + celebrations
src/components/quiz/progress-bar.tsx           — Session progress

database/migrations/XXX_quiz_tables.sql        — All new tables
```

## Key Files to Modify

```
src/components/sidebar/icon-nav.tsx            — Add quiz nav item
src/lib/notes/state/layout.zustand.ts          — Add 'quiz' to activeNav section type
```

## Dependencies

- `ts-fsrs` — FSRS-5 TypeScript implementation (npm package)
- `canvas-confetti` — Milestone celebrations (npm package)
- Existing: Cohere embeddings, pgvector, LLM API, postgres.js

## Verification Plan

1. **Database**: run migration, verify all 5 tables created with correct constraints
2. **Generation**: hit `/api/quiz/generate` with a chunk ID, verify LLM returns valid JSON matching schema
3. **FSRS**: write unit tests for card state transitions (new → learning → review, lapse → relearning)
4. **Dashboard**: verify due counts match `quiz_cards WHERE due <= now()`
5. **Session flow**: start session → answer question → verify FSRS recalculates → next question served
6. **Streak**: complete a review → verify streak incremented → skip a day → verify streak resets
7. **Filters**: test each filter type (course, module, search, note) returns correct chunk set
8. **Dedup**: generate question for chunk → attempt again at same Bloom's level → verify no duplicate
9. **Bloom's escalation**: answer 3+ correct at level 1 → verify next question is level 2

## MVP Scope Boundary

**In scope for MVP:**
- All 5 database tables + migrations
- Dashboard with stats, course list, streak display
- Full-screen quiz mode with MCQ, true/false, fill-in
- FSRS scheduling (ts-fsrs)
- Seed generation + on-demand growth
- Minimal feedback (correct/wrong + explanation)
- Course and module filtering
- Semantic search filtering
- Streak tracking + milestone confetti
- Bloom's level tracking and escalation

**Designed but NOT built in MVP:**
- Free-response questions with AI grading
- Conversational AI tutor feedback with follow-up chat
- "View source note" link from feedback
- Chat session filter UI
- Reward system (free AI days, vouchers, raffles)
- Leech re-explanation (AI teaches concept before re-quiz)
- Speed mode toggle
