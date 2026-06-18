-- Move vector storage out of Postgres. scripts/migrate-pgvector-to-qdrant.mjs
-- copies app.embeddings into Qdrant before this migration is applied.

DROP TABLE IF EXISTS app.embeddings;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'app'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.typname = 'vector'
  ) THEN
    DROP EXTENSION IF EXISTS vector;
  END IF;
END $$;
