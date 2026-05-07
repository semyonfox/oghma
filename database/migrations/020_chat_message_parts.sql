-- 020_chat_message_parts.sql
-- structured message parts so tool-call indicators survive reload without
-- baking them into prose. matches the openai/anthropic conversation shape:
-- each assistant message is a list of typed parts.
--
-- shape: jsonb array of
--   {"type":"text","text":"..."} | {"type":"tool","name":"getChunks","label":"Searching notes"}
--
-- text-only assistant messages and all user messages get a single text part on
-- backfill; new writes go through the parts-aware persistMessage.

ALTER TABLE app.chat_messages
    ADD COLUMN IF NOT EXISTS parts JSONB;

-- backfill: existing rows become a one-element parts array wrapping content.
-- safe to re-run because we only touch rows where parts IS NULL.
UPDATE app.chat_messages
   SET parts = jsonb_build_array(
                   jsonb_build_object('type', 'text', 'text', content)
               )
 WHERE parts IS NULL;

ALTER TABLE app.chat_messages
    ALTER COLUMN parts SET DEFAULT '[]'::jsonb;

ALTER TABLE app.chat_messages
    ALTER COLUMN parts SET NOT NULL;
