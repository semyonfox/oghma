-- composite index for chunks: covers RAG queries that filter on user_id
-- and delete-by-document queries, replacing the two single-column indexes
DROP INDEX IF EXISTS app.idx_chunks_user;
DROP INDEX IF EXISTS app.idx_chunks_document;

CREATE INDEX IF NOT EXISTS idx_chunks_user_document
  ON app.chunks (user_id, document_id);
