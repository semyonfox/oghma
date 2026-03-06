-- Migration: Migrate user_id and note_id to UUID v7

-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing constraints that reference old IDs
ALTER TABLE app.notes DROP CONSTRAINT IF EXISTS notes_user_id_fkey;

-- Alter user_id column
ALTER TABLE app.login
  ADD COLUMN user_id_uuid UUID DEFAULT gen_random_uuid() UNIQUE;

-- Copy data from old user_id to new user_id_uuid
UPDATE app.login SET user_id_uuid = gen_random_uuid() WHERE user_id_uuid IS NULL;

-- Make new column NOT NULL and PRIMARY KEY
ALTER TABLE app.login
  ALTER COLUMN user_id_uuid SET NOT NULL,
  DROP CONSTRAINT login_pkey,
  ADD PRIMARY KEY (user_id_uuid);

-- Rename column
ALTER TABLE app.login RENAME COLUMN user_id TO user_id_old;
ALTER TABLE app.login RENAME COLUMN user_id_uuid TO user_id;

-- Drop old column
ALTER TABLE app.login DROP COLUMN user_id_old;

-- Alter note_id column similarly
ALTER TABLE app.notes
  ADD COLUMN note_id_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN user_id_uuid UUID;

-- Copy data from old note_id and user_id to new columns
UPDATE app.notes SET 
  note_id_uuid = gen_random_uuid(),
  user_id_uuid = (SELECT user_id FROM app.login LIMIT 1) -- Assign to first user as placeholder
WHERE note_id_uuid IS NULL;

-- Make new columns NOT NULL
ALTER TABLE app.notes
  ALTER COLUMN note_id_uuid SET NOT NULL,
  ALTER COLUMN user_id_uuid SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE app.notes
  ADD CONSTRAINT notes_user_id_fkey 
  FOREIGN KEY (user_id_uuid) REFERENCES app.login(user_id) ON DELETE CASCADE;

-- Rename columns
ALTER TABLE app.notes RENAME COLUMN note_id TO note_id_old;
ALTER TABLE app.notes RENAME COLUMN note_id_uuid TO note_id;
ALTER TABLE app.notes RENAME COLUMN user_id TO user_id_old;
ALTER TABLE app.notes RENAME COLUMN user_id_uuid TO user_id;

-- Drop old columns
ALTER TABLE app.notes DROP COLUMN note_id_old;
ALTER TABLE app.notes DROP COLUMN user_id_old;

-- Recreate indexes
DROP INDEX IF EXISTS idx_login_email;
CREATE INDEX idx_login_email ON app.login(email);

DROP INDEX IF EXISTS idx_notes_user_id;
CREATE INDEX idx_notes_user_id ON app.notes(user_id);

DROP INDEX IF EXISTS idx_notes_created_at;
CREATE INDEX idx_notes_created_at ON app.notes(created_at DESC);
