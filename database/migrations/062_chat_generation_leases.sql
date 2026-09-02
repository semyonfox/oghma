-- Fence background chat workers with renewable leases and tie each durable
-- assistant message to the generation that produced it.

ALTER TABLE app.chat_generations
    ADD COLUMN IF NOT EXISTS lease_token UUID,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

ALTER TABLE app.chat_messages
    ADD COLUMN IF NOT EXISTS generation_id UUID
        REFERENCES app.chat_generations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_generation
    ON app.chat_messages(generation_id);

CREATE INDEX IF NOT EXISTS idx_chat_generations_recovery
    ON app.chat_generations(status, lease_expires_at, updated_at)
    WHERE status IN ('queued', 'generating');
