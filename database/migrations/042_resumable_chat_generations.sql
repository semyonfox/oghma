-- Durable ownership and replay metadata for navigation-safe chat generation.

CREATE TABLE IF NOT EXISTS app.chat_generations (
    id              UUID PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES app.chat_sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    request_payload JSONB NOT NULL,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_generations_status_check
      CHECK (status IN ('queued', 'generating', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_chat_generations_session_created
    ON app.chat_generations(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_generations_user_status
    ON app.chat_generations(user_id, status);
