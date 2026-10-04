-- Only terminal replay inputs expire. Messages and generation status remain.
ALTER TABLE app.chat_generations ALTER COLUMN request_payload DROP NOT NULL;
CREATE INDEX idx_chat_generations_payload_retention ON app.chat_generations (updated_at, id)
  WHERE status IN ('completed', 'failed', 'cancelled') AND request_payload IS NOT NULL;
ALTER TABLE app.chat_generations ADD CONSTRAINT chat_generations_active_payload
  CHECK (status IN ('completed', 'failed', 'cancelled') OR request_payload IS NOT NULL) NOT VALID;
