-- migrate embeddings from vector(1024) (Cohere embed-multilingual-v3.0)
--                     to vector(4096) (qwen3-embedding:8b via ai.semyon.ie)
--
-- all existing embeddings are wiped — they are cohere 1024-dim vectors and
-- are incompatible with qwen3. notes will be re-indexed on next access.
-- requires EMBEDDING_API_KEY to be set in env for self-hosted to activate.

-- 1. drop hnsw index (dimension-specific, must be rebuilt after type change)
DROP INDEX IF EXISTS app.idx_embeddings_hnsw;

-- 2. delete all embeddings (1024-dim cohere vectors, incompatible with qwen3 4096-dim)
DELETE FROM app.embeddings;

-- 3. delete all chunks — they will be regenerated when notes are re-indexed
--    (chunks without embeddings are orphans anyway; those with embeddings lose
--    their pair in step 2 so are no longer useful as search targets)
DELETE FROM app.chunks;

-- 4. change embedding column to match qwen3-embedding:8b native output dimension
ALTER TABLE app.embeddings
  ALTER COLUMN embedding TYPE vector(4096);

-- 5. ivfflat index for cosine similarity — hnsw max is 2000 dims, ivfflat supports 4096
--    the "low recall" notice when created on empty table is expected and harmless
--    once data grows, recreate with: lists = greatest(1, round(sqrt(count))::int)
CREATE INDEX idx_embeddings_ivfflat ON app.embeddings
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
