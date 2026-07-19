-- 044_repair_chat_message_json.sql
-- postgres.js already serializes values passed through sql.json(). Older chat
-- writes pre-serialized these fields, leaving JSONB strings containing JSON
-- instead of the arrays/objects the reload path expects. Unwrap those rows so
-- streamed thinking and tool activity survive the next session snapshot.

UPDATE app.chat_messages
SET parts = (parts #>> '{}')::jsonb
WHERE jsonb_typeof(parts) = 'string';

UPDATE app.chat_messages
SET sources = (sources #>> '{}')::jsonb
WHERE jsonb_typeof(sources) = 'string';

UPDATE app.chat_messages
SET metadata = (metadata #>> '{}')::jsonb
WHERE jsonb_typeof(metadata) = 'string';
