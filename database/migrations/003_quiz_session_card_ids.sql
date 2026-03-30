-- add card_ids column to quiz_sessions so the GET endpoint can reconstruct
-- the session (card list + current position) after a page refresh
ALTER TABLE app.quiz_sessions
    ADD COLUMN IF NOT EXISTS card_ids jsonb DEFAULT '[]'::jsonb;
