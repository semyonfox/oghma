-- RAG pipeline tables: per-document chunks and their vector embeddings
-- chunk_id FK ensures embeddings are always tied to a valid chunk

CREATE TABLE IF NOT EXISTS app.chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    page_number INT,
    section     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.embeddings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id   UUID NOT NULL REFERENCES app.chunks(id) ON DELETE CASCADE,
    embedding  vector(4096) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_user ON app.chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON app.chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON app.embeddings(chunk_id);
-- note: HNSW max is 2000 dims; qwen3-embedding:8b is 4096 so exact scan is used
-- add an IVFFlat index later once the table has data: CREATE INDEX CONCURRENTLY ...
