-- Canonical definitions replace the divergent baseline/018 index shape.
-- This runner is transactional: lock acquisition must fail promptly, and large
-- production builds require a scheduled window or a separately reviewed
-- concurrent prebuild. Never alter an already applied migration to tune indexes.
SET LOCAL lock_timeout = '3s';
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS app.idx_notes_user_active;
CREATE INDEX idx_notes_user_active ON app.notes (user_id, created_at DESC, note_id DESC)
  WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS app.idx_tree_user_parent;
CREATE INDEX IF NOT EXISTS idx_tree_items_user_parent ON app.tree_items (user_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON app.chat_messages (session_id, created_at DESC, id DESC);
DROP INDEX IF EXISTS app.idx_chat_messages_session;

-- Preserve literal substring search, including multilingual text. A tsvector
-- expression does not support the existing ILIKE queries.
CREATE INDEX IF NOT EXISTS idx_notes_title_trgm ON app.notes USING gin (title gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_content_trgm ON app.notes USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_extracted_search_trgm ON app.notes USING gin
  ((COALESCE(NULLIF(TRIM(extracted_text), ''), NULLIF(TRIM(content), ''), '')) gin_trgm_ops)
  WHERE deleted_at IS NULL AND is_folder = false;
CREATE INDEX IF NOT EXISTS idx_chunks_text_trgm ON app.chunks USING gin (text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_notes_user_course_active
  ON app.notes (user_id, canvas_course_id, note_id) WHERE deleted_at IS NULL;

-- The UNIQUE constraints already enforce and index these exact keys.
DROP INDEX IF EXISTS app.idx_login_email;
DROP INDEX IF EXISTS app.idx_oauth_accounts_provider;

-- No application query uses this historical English full-text expression.
DROP INDEX IF EXISTS app.idx_notes_search_vector;
-- The legacy snapshot/reset path marked 009 applied without these indexes.
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_due ON app.quiz_cards (user_id, due);
CREATE INDEX IF NOT EXISTS idx_quiz_cards_question ON app.quiz_cards (question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_note ON app.quiz_questions (note_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_chunk ON app.quiz_questions (chunk_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_session ON app.quiz_reviews (session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_question ON app.quiz_reviews (question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_created ON app.quiz_reviews (user_id, created_at);
