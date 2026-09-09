-- NOT VALID protects new writes immediately without deleting legacy data or
-- forcing an unbounded validation scan during deployment. The database audit
-- command reports unvalidated constraints; validate after checking legacy rows.
SET LOCAL lock_timeout = '3s';
CREATE UNIQUE INDEX IF NOT EXISTS uq_notes_owner_note ON app.notes (user_id, note_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_sessions_owner_id ON app.chat_sessions (user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_questions_owner_id ON app.quiz_questions (user_id, id);

ALTER TABLE app.chunks ADD CONSTRAINT chunks_owned_note_fk
  FOREIGN KEY (user_id, document_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.chat_sessions ADD CONSTRAINT chat_sessions_user_fk
  FOREIGN KEY (user_id) REFERENCES app.login (user_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.chat_messages ADD CONSTRAINT chat_messages_session_fk
  FOREIGN KEY (session_id) REFERENCES app.chat_sessions (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.chat_generations ADD CONSTRAINT chat_generations_owned_session_fk
  FOREIGN KEY (user_id, session_id) REFERENCES app.chat_sessions (user_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.quiz_questions ADD CONSTRAINT quiz_questions_owned_note_fk
  FOREIGN KEY (user_id, note_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.quiz_cards ADD CONSTRAINT quiz_cards_owned_question_fk
  FOREIGN KEY (user_id, question_id) REFERENCES app.quiz_questions (user_id, id) ON DELETE CASCADE NOT VALID;
-- Question chunk_id and review identifiers are historical provenance: replacing
-- an index must not cascade-delete learning history when old chunks disappear.

ALTER TABLE app.tree_items ADD CONSTRAINT tree_items_owned_note_fk
  FOREIGN KEY (user_id, note_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.tree_items ADD CONSTRAINT tree_items_owned_parent_fk
  FOREIGN KEY (user_id, parent_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.attachments ADD CONSTRAINT attachments_owned_note_fk
  FOREIGN KEY (user_id, note_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.note_links DROP CONSTRAINT note_links_source_note_id_fkey;
ALTER TABLE app.note_links DROP CONSTRAINT note_links_target_note_id_fkey;
ALTER TABLE app.note_links ADD CONSTRAINT note_links_owned_source_fk
  FOREIGN KEY (user_id, source_note_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE app.note_links ADD CONSTRAINT note_links_owned_target_fk
  FOREIGN KEY (user_id, target_note_id) REFERENCES app.notes (user_id, note_id) ON DELETE CASCADE NOT VALID;
