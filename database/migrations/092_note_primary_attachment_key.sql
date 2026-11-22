SET LOCAL lock_timeout = '3s';

-- same reason as 085: updated_at is the editor's save fence, so this repair
-- must not move it. the trigger is off for this transaction only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'app.notes'::regclass
      AND tgname = 'update_notes_updated_at_trigger'
      AND tgenabled <> 'D'
  ) THEN
    ALTER TABLE app.notes DISABLE TRIGGER update_notes_updated_at_trigger;
    CREATE TEMP TABLE reenable_notes_trigger ON COMMIT DROP AS SELECT 1;
  END IF;
END $$;

-- restore the primary file for notes created through the old upload-into-note path
UPDATE app.notes n
SET s3_key = a.s3_key
FROM app.attachments a
WHERE n.s3_key IS NULL
  AND n.is_folder = FALSE
  AND a.note_id = n.note_id
  AND a.user_id = n.user_id
  AND (SELECT count(*) FROM app.attachments x WHERE x.note_id = n.note_id) = 1
  AND lower(substring(n.title from '\.([A-Za-z0-9]+)$'))
      = lower(substring(a.s3_key from '\.([A-Za-z0-9]+)$'))
  AND lower(substring(a.s3_key from '\.([A-Za-z0-9]+)$')) NOT IN ('md', 'markdown');

DO $$
BEGIN
  IF to_regclass('pg_temp.reenable_notes_trigger') IS NOT NULL THEN
    ALTER TABLE app.notes ENABLE TRIGGER update_notes_updated_at_trigger;
  END IF;
END $$;
