// schema snapshot from before app.schema_migrations existed. only the disposable
// bootstraps (scripts/e2e/reset-db.ts and scripts/db-audit-fixture.ts) run it, on
// an empty app schema, followed by applyCurrentSchemaPatch and the migration
// catalog. production never runs this; it adopts history in prebuild-migrate.ts

export const BASELINE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS app;

-- Create extensions (ignore if they already exist on RDS)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- TABLE: app.login (Users)
-- ============================================================================
CREATE TABLE app.login (
    user_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL UNIQUE,
    hashed_password      TEXT NOT NULL,
    display_name         TEXT,
    avatar_url           TEXT,
    locale               TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    deleted_at           TIMESTAMPTZ,
    reset_token          VARCHAR UNIQUE,
    reset_token_expires  TIMESTAMPTZ,
    email_verified       BOOLEAN NOT NULL DEFAULT false,
    verification_token   TEXT,
    verification_token_expires TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_email ON app.login(email);
CREATE INDEX idx_login_active ON app.login(user_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_reset_token ON app.login(reset_token)
    WHERE reset_token IS NOT NULL;

-- ============================================================================
-- TABLE: app.oauth_accounts (OAuth Provider Linkage)
-- ============================================================================
CREATE TABLE app.oauth_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,
    provider_id    TEXT NOT NULL,
    email          TEXT,
    name           TEXT,
    avatar_url     TEXT,
    locale         TEXT,
    raw_profile    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

CREATE INDEX idx_oauth_accounts_user ON app.oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON app.oauth_accounts(provider, provider_id);

-- ============================================================================
-- TABLE: app.notes (Notes & Folders)
-- ============================================================================
CREATE TABLE app.notes (
    note_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Untitled',
    content     TEXT,
    s3_key      TEXT,
    is_folder   BOOLEAN NOT NULL DEFAULT false,
    deleted_at  TIMESTAMPTZ,
    pinned      SMALLINT NOT NULL DEFAULT 0,
    shared      SMALLINT NOT NULL DEFAULT 0,
    cloned_from UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    extracted_text TEXT,
    canvas_course_id INTEGER,
    canvas_module_id INTEGER,
    canvas_assignment_id INTEGER,
    canvas_academic_year TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_user_active ON app.notes(user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_notes_trash ON app.notes(user_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_notes_pinned ON app.notes(user_id, created_at DESC)
    WHERE pinned = 1 AND deleted_at IS NULL;

CREATE INDEX idx_notes_shared ON app.notes(shared, created_at DESC)
    WHERE shared = 1 AND deleted_at IS NULL;

CREATE INDEX idx_notes_s3_key ON app.notes(s3_key);

CREATE INDEX idx_notes_search_vector ON app.notes USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')))
    WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLE: app.tree_items (Per-user File Tree)
-- ============================================================================
CREATE TABLE app.tree_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    note_id     UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES app.notes(note_id) ON DELETE CASCADE,
    is_expanded BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, note_id)
);

CREATE INDEX idx_tree_user_parent ON app.tree_items(user_id, parent_id);
CREATE INDEX idx_tree_note ON app.tree_items(note_id);
-- UNIQUE(user_id, note_id) already creates an implicit index, no separate one needed

-- ============================================================================
-- TABLE: app.attachments (PDF uploads, images, etc)
-- ============================================================================
CREATE TABLE app.attachments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id    UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    s3_key     TEXT NOT NULL,
    mime_type  TEXT,
    file_size  BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_note ON app.attachments(note_id);
CREATE INDEX idx_attachments_user ON app.attachments(user_id);

-- ============================================================================
-- TABLE: app.pdf_annotations (PDF annotation storage)
-- ============================================================================
CREATE TABLE app.pdf_annotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id         UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    attachment_id   UUID REFERENCES app.attachments(id) ON DELETE CASCADE,
    page_number     INT,
    annotation_data JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_annotations_note ON app.pdf_annotations(note_id);
CREATE INDEX idx_pdf_annotations_user ON app.pdf_annotations(user_id);

-- ============================================================================
-- TABLE: app.chunks (text segments from documents)
-- ============================================================================
CREATE TABLE app.chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id     UUID NOT NULL,
    text        TEXT NOT NULL,
    page_number INTEGER,
    section     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_user_document ON app.chunks(user_id, document_id);

-- ============================================================================
-- TABLE: app.chat_sessions
-- ============================================================================
CREATE TABLE app.chat_sessions (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL,
    note_id    UUID,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: app.chat_messages
-- ============================================================================
CREATE TABLE app.chat_messages (
    id         UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    sources    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: app.canvas_import_jobs (background processing)
-- ============================================================================
CREATE TABLE app.canvas_import_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL,
    status         VARCHAR NOT NULL DEFAULT 'queued',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    course_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message  TEXT,
    job_type       TEXT NOT NULL DEFAULT 'import',
    expected_total INTEGER,
    type           TEXT NOT NULL DEFAULT 'canvas',
    input_s3_key   TEXT,
    output_s3_key  TEXT,
    download_url   TEXT
);

-- ============================================================================
-- TABLE: app.canvas_imports (per-file tracking)
-- ============================================================================
CREATE TABLE app.canvas_imports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    canvas_course_id INTEGER,
    canvas_module_id INTEGER,
    canvas_file_id   INTEGER,
    note_id          UUID,
    filename         TEXT,
    mime_type        TEXT,
    status           VARCHAR NOT NULL DEFAULT 'downloading',
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    job_id           UUID
);

-- ============================================================================
-- TABLE: app.quiz_questions (generated from chunks via LLM)
-- ============================================================================
CREATE TABLE app.quiz_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL,
    note_id        UUID NOT NULL,
    chunk_id       UUID NOT NULL,
    question_type  TEXT NOT NULL,
    bloom_level    INTEGER NOT NULL,
    question_text  TEXT NOT NULL,
    options        JSONB,
    correct_answer TEXT NOT NULL,
    explanation    TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: app.quiz_cards (FSRS spaced repetition)
-- ============================================================================
CREATE TABLE app.quiz_cards (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL,
    question_id    UUID NOT NULL,
    state          TEXT NOT NULL DEFAULT 'new',
    stability      DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty     DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days   INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    reps           INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    due            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_review    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at_trigger
BEFORE UPDATE ON app.notes
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

CREATE TRIGGER update_tree_items_updated_at_trigger
BEFORE UPDATE ON app.tree_items
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE app.login IS 'Users table with UUID v7 PKs.';
COMMENT ON TABLE app.oauth_accounts IS 'OAuth provider accounts linked to users. One user can have multiple providers.';
COMMENT ON TABLE app.notes IS 'Notes & folders. Folders have is_folder=true. Soft-deleted notes have deleted_at set.';
COMMENT ON TABLE app.tree_items IS 'Per-user file tree. parent_id null = root.';
COMMENT ON COLUMN app.notes.is_folder IS 'true if folder, false if note.';
`;
