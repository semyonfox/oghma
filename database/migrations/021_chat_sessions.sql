-- persist AI chat sessions and messages
-- allows users to resume conversations and browse chat history

CREATE TABLE IF NOT EXISTS app.chat_sessions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    note_id    UUID        REFERENCES app.notes(note_id) ON DELETE SET NULL,
    title      TEXT        NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.chat_messages (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID        NOT NULL REFERENCES app.chat_sessions(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT        NOT NULL,
    sources    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user    ON app.chat_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_note    ON app.chat_sessions(note_id) WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON app.chat_messages(session_id, created_at);

INSERT INTO app.schema_migrations(version, name)
VALUES ('021', 'chat_sessions_and_messages')
ON CONFLICT(version) DO NOTHING;
