-- 018_indexes_and_query_fixes.sql
-- adds missing composite/covering indexes and a unique constraint for upsert support
-- note: CREATE INDEX CONCURRENTLY cannot be used inside the migration runner's
-- transaction wrapper. these tables are small enough that brief locks are fine.

-- partial index on active notes: nearly every notes query filters WHERE deleted_at IS NULL.
-- smaller than a full index and exactly matches the hot query path.
CREATE INDEX IF NOT EXISTS idx_notes_user_active
    ON app.notes(user_id) WHERE deleted_at IS NULL;

-- quiz_cards(user_id, state): quiz session creation and dashboard filter by state
CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_state
    ON app.quiz_cards(user_id, state);

-- canvas_imports(job_id): import worker queries by job_id for status updates
CREATE INDEX IF NOT EXISTS idx_canvas_imports_job
    ON app.canvas_imports(job_id);

-- chat_sessions(user_id): session listing, deletion, note cleanup — no index besides PK
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
    ON app.chat_sessions(user_id);

-- chat_messages(session_id): message fetching by session — no index besides PK
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON app.chat_messages(session_id);

-- tree_items(user_id, parent_id): tree traversal in pg-tree.js and /api/tree/children.
-- existing: separate single-column indexes on user_id, note_id, parent_id
CREATE INDEX IF NOT EXISTS idx_tree_items_user_parent
    ON app.tree_items(user_id, parent_id);

-- pdf_annotations unique constraint: enables INSERT ... ON CONFLICT DO UPDATE
-- replacing the manual SELECT + conditional INSERT/UPDATE pattern
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdf_annotations_user_note_attachment
    ON app.pdf_annotations(user_id, note_id, attachment_id);
