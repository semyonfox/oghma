SET LOCAL lock_timeout = '3s';

-- quiz generation stops paying for chunks the model keeps refusing or garbling.
-- a skip counts twice, an unparseable reply once, and two strikes take the chunk
-- out of the uncovered pool. reindexing replaces chunk rows, so edited text
-- starts again from zero
ALTER TABLE app.chunks
  ADD COLUMN IF NOT EXISTS quiz_generation_failures SMALLINT NOT NULL DEFAULT 0;
