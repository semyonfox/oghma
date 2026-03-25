-- Drop the legacy HNSW index (HNSW max is 2000 dims, incompatible with 4096)
-- then resize notes.embedding to match qwen3-embedding:8b output (4096 dims)
-- IVFFlat index can be added later once there's enough data (~1000+ rows)

DROP INDEX IF EXISTS idx_notes_embedding_hnsw;

ALTER TABLE app.notes
  ALTER COLUMN embedding TYPE vector(4096);
