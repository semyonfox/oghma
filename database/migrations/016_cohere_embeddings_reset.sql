-- reset embedding tables for Cohere embed-english-v3.0 (1024 dims)
-- previous qwen3-embedding:8b used 4096 dims which blocked HNSW indexing
-- all existing chunks/embeddings are invalidated by the model switch

-- wipe existing data (incompatible dimensions)
TRUNCATE app.embeddings CASCADE;
TRUNCATE app.chunks CASCADE;

-- resize embedding column from 4096 to 1024
ALTER TABLE app.embeddings
  ALTER COLUMN embedding TYPE vector(1024);

-- HNSW index is now possible (limit is 2000 dims)
-- cosine distance matches Cohere's recommended similarity metric
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON app.embeddings USING hnsw (embedding vector_cosine_ops);

-- drop the legacy per-note embedding column — all search goes through chunks table now
ALTER TABLE app.notes DROP COLUMN IF EXISTS embedding;
