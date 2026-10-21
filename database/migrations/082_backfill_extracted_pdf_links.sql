SET LOCAL lock_timeout = '3s';

-- extracted notes written before 071 have no extracted_from_note_id, so the
-- editor can't offer their original PDF and /api/ingestion-status has to guess
-- by title. link a companion only when the pairing is unambiguous: one live
-- PDF and one unlinked live companion with the matching name in the same
-- folder, and the PDF has no linked companion yet. anything else stays as is
WITH companions AS (
    SELECT n.user_id, n.note_id, n.title, t.parent_id
    FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.deleted_at IS NULL
      AND n.is_folder = false
      AND n.s3_key IS NULL
      AND n.extraction_coverage IS NOT NULL
      AND n.extracted_from_note_id IS NULL
      AND RIGHT(n.title, 3) = '.md'
),
pdfs AS (
    SELECT n.user_id, n.note_id, n.title, t.parent_id
    FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.deleted_at IS NULL
      AND n.is_folder = false
      AND n.s3_key IS NOT NULL
      AND RIGHT(LOWER(n.title), 4) = '.pdf'
      AND NOT EXISTS (
          SELECT 1 FROM app.notes linked
          WHERE linked.user_id = n.user_id
            AND linked.extracted_from_note_id = n.note_id
            AND linked.deleted_at IS NULL
      )
),
pairs AS (
    SELECT c.user_id, c.note_id AS companion_id, p.note_id AS pdf_id,
           COUNT(*) OVER (PARTITION BY c.note_id) AS pdfs_for_companion,
           COUNT(*) OVER (PARTITION BY p.note_id) AS companions_for_pdf
    FROM companions c
    JOIN pdfs p
      ON p.user_id = c.user_id
     AND p.parent_id IS NOT DISTINCT FROM c.parent_id
     AND LEFT(p.title, LENGTH(p.title) - 4) || '.md' = c.title
)
UPDATE app.notes n
SET extracted_from_note_id = pairs.pdf_id
FROM pairs
WHERE n.note_id = pairs.companion_id
  AND n.user_id = pairs.user_id
  AND pairs.pdfs_for_companion = 1
  AND pairs.companions_for_pdf = 1;
