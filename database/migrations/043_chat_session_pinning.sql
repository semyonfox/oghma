ALTER TABLE app.chat_sessions
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_pinned_updated
    ON app.chat_sessions(user_id, pinned DESC, updated_at DESC);
