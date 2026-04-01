-- RAG pipeline tables consolidation
-- codifies tables that were created ad-hoc in production
-- all CREATE TABLE IF NOT EXISTS for idempotency

-- chunks: text segments from documents, linked to notes
CREATE TABLE IF NOT EXISTS app.chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id     UUID NOT NULL,
    text        TEXT NOT NULL,
    page_number INTEGER,
    section     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_user_document ON app.chunks(user_id, document_id);

-- embeddings: vector representations of chunks (Cohere embed-multilingual-v3.0, 1024 dims)
CREATE TABLE IF NOT EXISTS app.embeddings (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id  UUID NOT NULL,
    embedding vector(1024) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON app.embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON app.embeddings USING hnsw(embedding vector_cosine_ops);

-- chat sessions
CREATE TABLE IF NOT EXISTS app.chat_sessions (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL,
    note_id    UUID,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- chat messages
CREATE TABLE IF NOT EXISTS app.chat_messages (
    id         UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    sources    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- canvas import jobs (background processing)
CREATE TABLE IF NOT EXISTS app.canvas_import_jobs (
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

-- canvas imports (per-file tracking)
CREATE TABLE IF NOT EXISTS app.canvas_imports (
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

-- quiz questions (generated from chunks via LLM)
CREATE TABLE IF NOT EXISTS app.quiz_questions (
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

-- quiz cards (FSRS spaced repetition)
CREATE TABLE IF NOT EXISTS app.quiz_cards (
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

-- add extracted_text column to notes if missing
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS extracted_text TEXT;
-- add canvas columns to notes if missing
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_course_id INTEGER;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_module_id INTEGER;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_assignment_id INTEGER;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_academic_year TEXT;

-- drop legacy notes.embedding column and index if they exist
-- (embeddings now live in app.embeddings with 1024 dims from Cohere)
DROP INDEX IF EXISTS app.idx_notes_embedding_hnsw;
ALTER TABLE app.notes DROP COLUMN IF EXISTS embedding;
