-- Keep chat generation ownership on the server so clients can leave and later
-- reattach to a response that is still being produced.

ALTER TABLE app.chat_sessions
    ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE app.chat_sessions
    DROP CONSTRAINT IF EXISTS chat_sessions_generation_status_check;

ALTER TABLE app.chat_sessions
    ADD CONSTRAINT chat_sessions_generation_status_check
    CHECK (generation_status IN ('idle', 'generating', 'failed'));
