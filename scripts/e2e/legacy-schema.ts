import type postgres from "postgres";

export async function applyCurrentSchemaPatch(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE app.login
      ADD COLUMN IF NOT EXISTS canvas_token TEXT,
      ADD COLUMN IF NOT EXISTS canvas_domain TEXT,
      ADD COLUMN IF NOT EXISTS calendar_export_token UUID;

    DELETE FROM app.chunks;
    DROP TABLE IF EXISTS app.embeddings;

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

    CREATE TABLE IF NOT EXISTS app.user_streaks (
      user_id           UUID PRIMARY KEY,
      current_streak    INTEGER NOT NULL DEFAULT 0,
      longest_streak    INTEGER NOT NULL DEFAULT 0,
      last_review_date  DATE,
      total_review_days INTEGER NOT NULL DEFAULT 0,
      streak_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.user_course_settings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      canvas_course_id INTEGER NOT NULL,
      course_name      TEXT NOT NULL,
      is_active        BOOLEAN NOT NULL DEFAULT true,
      auto_archived    BOOLEAN NOT NULL DEFAULT false,
      archived_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, canvas_course_id)
    );

    CREATE TABLE IF NOT EXISTS app.assignments (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      canvas_course_id     INTEGER,
      canvas_assignment_id INTEGER,
      title                TEXT NOT NULL,
      description          TEXT,
      course_name          TEXT,
      course_color         TEXT,
      due_at               TIMESTAMPTZ,
      estimated_hours      DOUBLE PRECISION,
      logged_hours         DOUBLE PRECISION NOT NULL DEFAULT 0,
      status               TEXT NOT NULL DEFAULT 'upcoming',
      source               TEXT NOT NULL DEFAULT 'manual',
      submitted_at         TIMESTAMPTZ,
      score                DOUBLE PRECISION,
      points_possible      DOUBLE PRECISION,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.time_blocks (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      assignment_id  UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
      title          TEXT,
      starts_at      TIMESTAMPTZ NOT NULL,
      ends_at        TIMESTAMPTZ NOT NULL,
      pomodoro_count INTEGER NOT NULL DEFAULT 1,
      completed      BOOLEAN NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.pomodoro_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      assignment_id UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
      time_block_id UUID REFERENCES app.time_blocks(id) ON DELETE SET NULL,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at      TIMESTAMPTZ,
      duration_mins INTEGER NOT NULL DEFAULT 25,
      type          TEXT NOT NULL DEFAULT 'focus',
      completed     BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.ingestion_jobs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id       UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
      user_id       UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      s3_key        TEXT NOT NULL,
      mime_type     TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      chunks_stored INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(note_id, s3_key)
    );

    CREATE TABLE IF NOT EXISTS app.rate_limit_log (
      id         BIGSERIAL PRIMARY KEY,
      category   TEXT NOT NULL,
      identifier TEXT NOT NULL,
      blocked    BOOLEAN NOT NULL DEFAULT false,
      count      INTEGER NOT NULL DEFAULT 0,
      limit_max  INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE app.chat_sessions
      ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE app.chat_messages
      ADD COLUMN IF NOT EXISTS parts JSONB;
    UPDATE app.chat_messages
      SET parts = jsonb_build_array(jsonb_build_object('type', 'text', 'text', content))
      WHERE parts IS NULL;
    ALTER TABLE app.chat_messages
      ALTER COLUMN parts SET DEFAULT '[]'::jsonb,
      ALTER COLUMN parts SET NOT NULL;

    ALTER TABLE app.canvas_imports
      ADD COLUMN IF NOT EXISTS parent_folder_id UUID,
      ADD COLUMN IF NOT EXISTS s3_prefix TEXT;

    ALTER TABLE app.canvas_import_jobs
      ALTER COLUMN status TYPE TEXT,
      ADD COLUMN IF NOT EXISTS processed_files INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS canvas_imports_user_file_unique
      ON app.canvas_imports (user_id, canvas_file_id);
    CREATE INDEX IF NOT EXISTS idx_canvas_imports_job
      ON app.canvas_imports(job_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
      ON app.chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON app.chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user
      ON app.quiz_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_state
      ON app.quiz_cards(user_id, state);
    CREATE INDEX IF NOT EXISTS idx_time_blocks_user_range
      ON app.time_blocks(user_id, starts_at, ends_at);
  `);
}

