-- reset embeddings for model switch: embed-english-v3.0 → embed-multilingual-v3.0
-- dimensions stay 1024, HNSW index stays — just the vectors are incompatible
-- existing notes and chunks text are preserved; only embedding vectors are wiped
-- embeddings regenerate on next Canvas import or note edit

TRUNCATE app.embeddings;

-- clear extracted_text so the double-gate in PUT /api/notes/[id] re-embeds on next save
UPDATE app.notes SET extracted_text = NULL WHERE extracted_text IS NOT NULL;
