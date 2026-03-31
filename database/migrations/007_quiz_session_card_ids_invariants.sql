-- enforce quiz session card_ids shape so reads do not crash on malformed rows

-- normalize legacy/invalid rows to json arrays
UPDATE app.quiz_sessions
SET card_ids =
    CASE
        WHEN card_ids IS NULL THEN '[]'::jsonb
        WHEN jsonb_typeof(card_ids) = 'array' THEN card_ids
        ELSE '[]'::jsonb
    END;

-- keep invariant in schema
ALTER TABLE app.quiz_sessions
    ALTER COLUMN card_ids SET DEFAULT '[]'::jsonb;

ALTER TABLE app.quiz_sessions
    ALTER COLUMN card_ids SET NOT NULL;

ALTER TABLE app.quiz_sessions
    DROP CONSTRAINT IF EXISTS quiz_sessions_card_ids_is_array;

ALTER TABLE app.quiz_sessions
    ADD CONSTRAINT quiz_sessions_card_ids_is_array
    CHECK (jsonb_typeof(card_ids) = 'array');
