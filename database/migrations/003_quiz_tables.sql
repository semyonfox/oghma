-- quiz questions generated from note chunks
CREATE TABLE IF NOT EXISTS app.quiz_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    note_id         UUID NOT NULL,
    chunk_id        UUID NOT NULL,
    question_type   TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'fill_in', 'free_response')),
    bloom_level     INT NOT NULL CHECK (bloom_level BETWEEN 1 AND 4),
    question_text   TEXT NOT NULL,
    options         JSONB,
    correct_answer  TEXT NOT NULL,
    explanation     TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, chunk_id, bloom_level)
);

-- FSRS card state per question per user
CREATE TABLE IF NOT EXISTS app.quiz_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES app.quiz_questions(id) ON DELETE CASCADE,
    state           TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
    stability       DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty      DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days    INT NOT NULL DEFAULT 0,
    scheduled_days  INT NOT NULL DEFAULT 0,
    reps            INT NOT NULL DEFAULT 0,
    lapses          INT NOT NULL DEFAULT 0,
    due             TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_review     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, question_id)
);

-- quiz sessions (one per study sitting)
CREATE TABLE IF NOT EXISTS app.quiz_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    filter_type     TEXT NOT NULL CHECK (filter_type IN ('course', 'module', 'note', 'search', 'chat_session', 'all')),
    filter_value    JSONB,
    total_questions INT NOT NULL DEFAULT 0,
    correct_count   INT NOT NULL DEFAULT 0,
    bloom_distribution JSONB NOT NULL DEFAULT '{}',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- answer history
CREATE TABLE IF NOT EXISTS app.quiz_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES app.quiz_cards(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES app.quiz_questions(id) ON DELETE CASCADE,
    rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 4),
    user_answer     TEXT NOT NULL DEFAULT '',
    was_correct     BOOLEAN NOT NULL,
    response_time_ms INT,
    ai_feedback     TEXT,
    session_id      UUID REFERENCES app.quiz_sessions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- streak tracking (one row per user)
CREATE TABLE IF NOT EXISTS app.user_streaks (
    user_id             UUID PRIMARY KEY REFERENCES app.login(user_id) ON DELETE CASCADE,
    current_streak      INT NOT NULL DEFAULT 0,
    longest_streak      INT NOT NULL DEFAULT 0,
    last_review_date    DATE,
    total_review_days   INT NOT NULL DEFAULT 0,
    streak_milestones   JSONB NOT NULL DEFAULT '[]',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_due ON app.quiz_cards(user_id, due);
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_state ON app.quiz_cards(user_id, state);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_user_note ON app.quiz_questions(user_id, note_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_session ON app.quiz_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user ON app.quiz_sessions(user_id);
