-- 080_quiz_card_learning_steps.sql
-- ts-fsrs 5 tracks the position inside the (re)learning steps on the card.
-- without it every reload restarted step 0, so a card answered "good" while
-- learning never graduated to review. a constant default is metadata-only, so
-- this does not rewrite quiz_cards
ALTER TABLE app.quiz_cards
    ADD COLUMN IF NOT EXISTS learning_steps INTEGER NOT NULL DEFAULT 0;
