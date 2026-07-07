-- 033_extraction_coverage.sql
-- Record how a note's text was extracted (source, page range, partial flag)
-- so page-limited marker OCR is visible and re-enrichable instead of being
-- silently indexed as a complete extraction.

ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS extraction_coverage JSONB;

COMMENT ON COLUMN app.notes.extraction_coverage IS
    'set by the import pipeline: { source, page_range, partial, extracted_at }; null for notes that never went through extraction';
