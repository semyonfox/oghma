-- add completed flag to time_blocks so study blocks can be marked done like assignments
ALTER TABLE app.time_blocks
  ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
