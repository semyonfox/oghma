-- Quiz infrastructure tables
-- codifies tables that were created ad-hoc in production
-- all CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS for idempotency

-- quiz sessions: active quiz sessions
CREATE TABLE IF NOT EXISTS app.quiz_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    filter_type     TEXT NOT NULL,
    filter_value    JSONB,
    total_questions INTEGER NOT NULL DEFAULT 0,
    correct_count   INTEGER NOT NULL DEFAULT 0,
    card_ids        JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(card_ids) = 'array'),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user ON app.quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_active ON app.quiz_sessions(user_id) WHERE completed_at IS NULL;

-- quiz reviews: review history per question attempt
CREATE TABLE IF NOT EXISTS app.quiz_reviews (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    card_id          UUID NOT NULL,
    question_id      UUID NOT NULL,
    session_id       UUID,
    rating           INTEGER NOT NULL,
    user_answer      TEXT NOT NULL DEFAULT '',
    was_correct      BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_reviews_user ON app.quiz_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_session ON app.quiz_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_question ON app.quiz_reviews(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_created ON app.quiz_reviews(user_id, created_at);

-- user streaks: streak tracking
CREATE TABLE IF NOT EXISTS app.user_streaks (
    user_id           UUID PRIMARY KEY,
    current_streak    INTEGER NOT NULL DEFAULT 0,
    longest_streak    INTEGER NOT NULL DEFAULT 0,
    last_review_date  DATE,
    total_review_days INTEGER NOT NULL DEFAULT 0,
    streak_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- missing unique constraint on quiz_questions
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_questions_user_chunk_bloom
    ON app.quiz_questions (user_id, chunk_id, bloom_level);

-- missing indexes on quiz_cards
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user ON app.quiz_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_cards_question ON app.quiz_cards(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_due ON app.quiz_cards(user_id, due);

-- missing indexes on quiz_questions
CREATE INDEX IF NOT EXISTS idx_quiz_questions_user ON app.quiz_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_chunk ON app.quiz_questions(chunk_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_note ON app.quiz_questions(note_id);
