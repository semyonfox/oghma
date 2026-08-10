-- Group clear historical PDF + extracted-Markdown sibling pairs beneath a
-- folder named after the source document. This deliberately ignores anything
-- ambiguous: both children must be active siblings, the PDF must have a real
-- PDF attachment, and the Markdown must carry extraction metadata.

WITH raw_candidates AS (
  SELECT
    pdf.note_id AS pdf_note_id,
    markdown.note_id AS markdown_note_id,
    pdf.user_id,
    pdf_tree.parent_id AS original_parent_id,
    regexp_replace(pdf.title, '\.[^.]+$', '') AS bundle_title
  FROM app.notes AS pdf
  JOIN app.tree_items AS pdf_tree
    ON pdf_tree.note_id = pdf.note_id
   AND pdf_tree.user_id = pdf.user_id
  JOIN app.notes AS markdown
    ON markdown.user_id = pdf.user_id
   AND markdown.title = regexp_replace(pdf.title, '\.[^.]+$', '') || '.md'
   AND markdown.is_folder = FALSE
   AND markdown.deleted_at IS NULL
   AND markdown.s3_key IS NULL
   AND markdown.extraction_coverage IS NOT NULL
  JOIN app.tree_items AS markdown_tree
    ON markdown_tree.note_id = markdown.note_id
   AND markdown_tree.user_id = markdown.user_id
   AND markdown_tree.parent_id IS NOT DISTINCT FROM pdf_tree.parent_id
  LEFT JOIN app.notes AS parent
    ON parent.note_id = pdf_tree.parent_id
   AND parent.user_id = pdf.user_id
  WHERE pdf.is_folder = FALSE
    AND pdf.deleted_at IS NULL
    AND pdf.s3_key IS NOT NULL
    AND pdf.title ~* '\.pdf$'
    AND regexp_replace(pdf.title, '\.[^.]+$', '') <> ''
    AND (pdf_tree.parent_id IS NULL OR parent.deleted_at IS NULL)
    -- A pair already inside its own matching folder is already bundled.
    AND NOT (COALESCE(parent.is_folder, FALSE) AND parent.title = regexp_replace(pdf.title, '\.[^.]+$', ''))
    AND EXISTS (
      SELECT 1
      FROM app.attachments AS attachment
      WHERE attachment.note_id = pdf.note_id
        AND attachment.user_id = pdf.user_id
        AND attachment.s3_key = pdf.s3_key
        AND attachment.mime_type = 'application/pdf'
    )
),
candidate_counts AS (
  SELECT
    raw_candidates.*,
    COUNT(*) OVER (PARTITION BY pdf_note_id) AS markdown_match_count,
    COUNT(*) OVER (PARTITION BY markdown_note_id) AS pdf_match_count
  FROM raw_candidates
),
candidates AS (
  SELECT *
  FROM candidate_counts
  WHERE markdown_match_count = 1
    AND pdf_match_count = 1
),
bundle_groups AS (
  SELECT DISTINCT user_id, original_parent_id, bundle_title
  FROM candidates
),
missing_bundles AS (
  SELECT
    gen_random_uuid() AS note_id,
    bundle_groups.user_id,
    bundle_groups.original_parent_id,
    bundle_groups.bundle_title
  FROM bundle_groups
  WHERE NOT EXISTS (
    SELECT 1
    FROM app.notes AS folder
    JOIN app.tree_items AS folder_tree
      ON folder_tree.note_id = folder.note_id
     AND folder_tree.user_id = folder.user_id
    WHERE folder.user_id = bundle_groups.user_id
      AND folder.title = bundle_groups.bundle_title
      AND folder.is_folder = TRUE
      AND folder.deleted_at IS NULL
      AND folder_tree.parent_id IS NOT DISTINCT FROM bundle_groups.original_parent_id
  )
),
inserted_bundles AS (
  INSERT INTO app.notes (
    note_id, user_id, title, content, is_folder, created_at, updated_at
  )
  SELECT
    note_id, user_id, bundle_title, '', TRUE, NOW(), NOW()
  FROM missing_bundles
  RETURNING note_id
)
INSERT INTO app.tree_items (user_id, note_id, parent_id)
SELECT
  missing_bundles.user_id,
  missing_bundles.note_id,
  missing_bundles.original_parent_id
FROM missing_bundles
JOIN inserted_bundles
  ON inserted_bundles.note_id = missing_bundles.note_id
ON CONFLICT DO NOTHING;

WITH raw_candidates AS (
  SELECT
    pdf.note_id AS pdf_note_id,
    markdown.note_id AS markdown_note_id,
    pdf.user_id,
    pdf_tree.parent_id AS original_parent_id,
    regexp_replace(pdf.title, '\.[^.]+$', '') AS bundle_title
  FROM app.notes AS pdf
  JOIN app.tree_items AS pdf_tree
    ON pdf_tree.note_id = pdf.note_id
   AND pdf_tree.user_id = pdf.user_id
  JOIN app.notes AS markdown
    ON markdown.user_id = pdf.user_id
   AND markdown.title = regexp_replace(pdf.title, '\.[^.]+$', '') || '.md'
   AND markdown.is_folder = FALSE
   AND markdown.deleted_at IS NULL
   AND markdown.s3_key IS NULL
   AND markdown.extraction_coverage IS NOT NULL
  JOIN app.tree_items AS markdown_tree
    ON markdown_tree.note_id = markdown.note_id
   AND markdown_tree.user_id = markdown.user_id
   AND markdown_tree.parent_id IS NOT DISTINCT FROM pdf_tree.parent_id
  LEFT JOIN app.notes AS parent
    ON parent.note_id = pdf_tree.parent_id
   AND parent.user_id = pdf.user_id
  WHERE pdf.is_folder = FALSE
    AND pdf.deleted_at IS NULL
    AND pdf.s3_key IS NOT NULL
    AND pdf.title ~* '\.pdf$'
    AND regexp_replace(pdf.title, '\.[^.]+$', '') <> ''
    AND (pdf_tree.parent_id IS NULL OR parent.deleted_at IS NULL)
    AND NOT (COALESCE(parent.is_folder, FALSE) AND parent.title = regexp_replace(pdf.title, '\.[^.]+$', ''))
    AND EXISTS (
      SELECT 1
      FROM app.attachments AS attachment
      WHERE attachment.note_id = pdf.note_id
        AND attachment.user_id = pdf.user_id
        AND attachment.s3_key = pdf.s3_key
        AND attachment.mime_type = 'application/pdf'
    )
),
candidate_counts AS (
  SELECT
    raw_candidates.*,
    COUNT(*) OVER (PARTITION BY pdf_note_id) AS markdown_match_count,
    COUNT(*) OVER (PARTITION BY markdown_note_id) AS pdf_match_count
  FROM raw_candidates
),
candidates AS (
  SELECT *
  FROM candidate_counts
  WHERE markdown_match_count = 1
    AND pdf_match_count = 1
),
target_bundles AS (
  SELECT DISTINCT ON (
    candidates.pdf_note_id,
    candidates.markdown_note_id
  )
    candidates.pdf_note_id,
    candidates.markdown_note_id,
    candidates.user_id,
    candidates.original_parent_id,
    folder.note_id AS bundle_note_id
  FROM candidates
  JOIN app.notes AS folder
    ON folder.user_id = candidates.user_id
   AND folder.title = candidates.bundle_title
   AND folder.is_folder = TRUE
   AND folder.deleted_at IS NULL
  JOIN app.tree_items AS folder_tree
    ON folder_tree.note_id = folder.note_id
   AND folder_tree.user_id = folder.user_id
   AND folder_tree.parent_id IS NOT DISTINCT FROM candidates.original_parent_id
  ORDER BY
    candidates.pdf_note_id,
    candidates.markdown_note_id,
    folder.created_at,
    folder.note_id
)
UPDATE app.tree_items AS child_tree
SET parent_id = target_bundles.bundle_note_id,
    updated_at = NOW()
FROM target_bundles
WHERE child_tree.user_id = target_bundles.user_id
  AND child_tree.note_id IN (
    target_bundles.pdf_note_id,
    target_bundles.markdown_note_id
  )
  AND child_tree.parent_id IS NOT DISTINCT FROM target_bundles.original_parent_id;
