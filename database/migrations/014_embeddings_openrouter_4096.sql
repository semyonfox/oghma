-- switch embeddings to 4096 dims for Qwen3-Embedding-8B via OpenRouter
--
-- all existing chunks+embeddings are cleared — they were 1024-dim Cohere vectors,
-- incompatible with the new 4096-dim model. a full re-index is required after.
--
-- pgvector hnsw/ivfflat max is 2000 dims, so no ANN index at this size.
-- with ~14K chunks, sequential scan is fast enough (<50ms on RDS).

-- 1. drop hnsw index (incompatible with new dimension)
DROP INDEX IF EXISTS app.idx_embeddings_hnsw;

-- 2. clear stale data
DELETE FROM app.embeddings;
DELETE FROM app.chunks;

-- 3. widen column to 4096 dims
ALTER TABLE app.embeddings
  ALTER COLUMN embedding TYPE vector(4096);
