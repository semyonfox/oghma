-- 032_chat_message_metadata.sql
-- Store non-prose assistant metadata, including streamed reasoning text and
-- interrupted-generation details, without polluting message content/history.

ALTER TABLE app.chat_messages
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
