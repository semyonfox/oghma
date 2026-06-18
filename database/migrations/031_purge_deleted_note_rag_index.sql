-- 031: remove stale search index rows for soft-deleted notes.
--
-- Deleted notes are hidden by normal note reads, but their chunk rows can still
-- be searched by exact fallback and can be copied into Qdrant. Keep only active
-- note chunks in the relational search index.

DO $$
BEGIN
  IF to_regclass('app.embeddings') IS NOT NULL THEN
    DELETE FROM app.embeddings e
    USING app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
    WHERE e.chunk_id = c.id
      AND n.deleted_at IS NOT NULL;
  END IF;
END $$;

DELETE FROM app.chunks c
USING app.notes n
WHERE n.note_id = c.document_id
  AND n.user_id = c.user_id
  AND n.deleted_at IS NOT NULL;
