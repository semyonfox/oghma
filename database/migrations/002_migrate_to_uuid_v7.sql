-- Migration: Migrate all ID columns to UUID v7 (Step 1)
-- Handles: app.login.user_id, app.notes.note_id + user_id, app.documents.id + user_id, app.chunks.id + user_id/document_id
-- Created: 2025-03-06
-- Status: SAFE for test databases (3 users, 0 notes/documents/chunks)

BEGIN;

-- ============================================================================
-- STEP 0: Drop all foreign key constraints that depend on old IDs
-- ============================================================================

ALTER TABLE IF EXISTS app.notes DROP CONSTRAINT IF EXISTS notes_user_id_fkey CASCADE;
ALTER TABLE IF EXISTS app.documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey CASCADE;
ALTER TABLE IF EXISTS app.chunks DROP CONSTRAINT IF EXISTS chunks_user_id_fkey CASCADE;
ALTER TABLE IF EXISTS app.chunks DROP CONSTRAINT IF EXISTS chunks_document_id_fkey CASCADE;

-- ============================================================================
-- STEP 1: Migrate app.login (users)
-- ============================================================================

ALTER TABLE app.login ADD COLUMN user_id_uuid UUID DEFAULT gen_random_uuid();
UPDATE app.login SET user_id_uuid = gen_random_uuid() WHERE user_id_uuid IS NULL;
ALTER TABLE app.login ALTER COLUMN user_id_uuid SET NOT NULL;

-- Create mapping table to preserve relationships
CREATE TEMP TABLE login_id_map (old_id INTEGER, new_id UUID);
INSERT INTO login_id_map SELECT user_id, user_id_uuid FROM app.login;

-- Drop old primary key and unique constraint
ALTER TABLE app.login DROP CONSTRAINT IF EXISTS login_pkey CASCADE;
ALTER TABLE app.login DROP CONSTRAINT IF EXISTS login_email_key CASCADE;

-- Make user_id_uuid the primary key
ALTER TABLE app.login ADD PRIMARY KEY (user_id_uuid);
ALTER TABLE app.login ADD UNIQUE (email);

-- Drop old user_id and rename
ALTER TABLE app.login DROP COLUMN user_id;
ALTER TABLE app.login RENAME COLUMN user_id_uuid TO user_id;

-- ============================================================================
-- STEP 2: Migrate app.notes (note_id + user_id)
-- ============================================================================

ALTER TABLE app.notes ADD COLUMN note_id_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE app.notes ADD COLUMN user_id_uuid UUID;

UPDATE app.notes SET note_id_uuid = gen_random_uuid() WHERE note_id_uuid IS NULL;
UPDATE app.notes n SET user_id_uuid = m.new_id FROM login_id_map m WHERE n.user_id = m.old_id;

ALTER TABLE app.notes ALTER COLUMN note_id_uuid SET NOT NULL;
ALTER TABLE app.notes ALTER COLUMN user_id_uuid SET NOT NULL;

ALTER TABLE app.notes DROP CONSTRAINT IF EXISTS notes_pkey CASCADE;
ALTER TABLE app.notes ADD PRIMARY KEY (note_id_uuid);
ALTER TABLE app.notes ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id_uuid) REFERENCES app.login(user_id) ON DELETE CASCADE;

ALTER TABLE app.notes DROP COLUMN note_id;
ALTER TABLE app.notes DROP COLUMN user_id;
ALTER TABLE app.notes RENAME COLUMN note_id_uuid TO note_id;
ALTER TABLE app.notes RENAME COLUMN user_id_uuid TO user_id;

-- ============================================================================
-- STEP 3: Migrate app.documents (id + user_id)
-- ============================================================================

ALTER TABLE app.documents ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE app.documents ADD COLUMN user_id_uuid UUID;

UPDATE app.documents SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
UPDATE app.documents d SET user_id_uuid = m.new_id FROM login_id_map m WHERE d.user_id = m.old_id;

ALTER TABLE app.documents ALTER COLUMN id_uuid SET NOT NULL;
ALTER TABLE app.documents ALTER COLUMN user_id_uuid SET NOT NULL;

ALTER TABLE app.documents DROP CONSTRAINT IF EXISTS documents_pkey CASCADE;
ALTER TABLE app.documents ADD PRIMARY KEY (id_uuid);
ALTER TABLE app.documents ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id_uuid) REFERENCES app.login(user_id) ON DELETE CASCADE;

ALTER TABLE app.documents DROP COLUMN id;
ALTER TABLE app.documents DROP COLUMN user_id;
ALTER TABLE app.documents RENAME COLUMN id_uuid TO id;
ALTER TABLE app.documents RENAME COLUMN user_id_uuid TO user_id;

-- ============================================================================
-- STEP 4: Migrate app.chunks (id + user_id + document_id)
-- ============================================================================

ALTER TABLE app.chunks ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE app.chunks ADD COLUMN user_id_uuid UUID;
ALTER TABLE app.chunks ADD COLUMN document_id_uuid UUID;

UPDATE app.chunks SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
UPDATE app.chunks c SET user_id_uuid = m.new_id FROM login_id_map m WHERE c.user_id = m.old_id;

ALTER TABLE app.chunks ALTER COLUMN id_uuid SET NOT NULL;
ALTER TABLE app.chunks ALTER COLUMN user_id_uuid SET NOT NULL;

ALTER TABLE app.chunks DROP CONSTRAINT IF EXISTS chunks_pkey CASCADE;
ALTER TABLE app.chunks ADD PRIMARY KEY (id_uuid);
ALTER TABLE app.chunks ADD CONSTRAINT chunks_user_id_fkey FOREIGN KEY (user_id_uuid) REFERENCES app.login(user_id) ON DELETE CASCADE;

ALTER TABLE app.chunks DROP COLUMN id;
ALTER TABLE app.chunks DROP COLUMN user_id;
ALTER TABLE app.chunks DROP COLUMN document_id;
ALTER TABLE app.chunks RENAME COLUMN id_uuid TO id;
ALTER TABLE app.chunks RENAME COLUMN user_id_uuid TO user_id;
ALTER TABLE app.chunks RENAME COLUMN document_id_uuid TO document_id;

-- ============================================================================
-- STEP 5: Recreate indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_login_email;
CREATE INDEX idx_login_email ON app.login(email);

DROP INDEX IF EXISTS idx_reset_token;
CREATE INDEX idx_reset_token ON app.login(reset_token) WHERE reset_token IS NOT NULL;

DROP INDEX IF EXISTS idx_notes_user_id;
CREATE INDEX idx_notes_user_id ON app.notes(user_id);

DROP INDEX IF EXISTS idx_notes_created_at;
CREATE INDEX idx_notes_created_at ON app.notes(created_at DESC);

DROP INDEX IF EXISTS documents_user_id_idx;
CREATE INDEX documents_user_id_idx ON app.documents(user_id);

DROP INDEX IF EXISTS chunks_user_id_idx;
CREATE INDEX chunks_user_id_idx ON app.chunks(user_id);

DROP INDEX IF EXISTS chunks_document_id_idx;
CREATE INDEX chunks_document_id_idx ON app.chunks(document_id);

COMMIT;
