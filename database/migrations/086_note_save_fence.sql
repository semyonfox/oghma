SET LOCAL lock_timeout = '3s';

ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS reindex_requested_at TIMESTAMPTZ;

-- derived search state does not change the editor's content version
CREATE OR REPLACE FUNCTION app.update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_NARGS = 0 AND TG_TABLE_SCHEMA = 'app' AND TG_TABLE_NAME = 'notes'
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND (to_jsonb(NEW) - 'extracted_text' - 'reindex_requested_at')
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'extracted_text' - 'reindex_requested_at') THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- an explicit timestamp assignment keeps the existing stamping behaviour,
-- even when the assigned value equals the old value
CREATE OR REPLACE TRIGGER update_notes_explicit_updated_at_trigger
BEFORE UPDATE OF updated_at ON app.notes
FOR EACH ROW
EXECUTE FUNCTION app.update_notes_updated_at('explicit');

-- bind the existing trigger explicitly, independent of the migration role's search path
CREATE OR REPLACE TRIGGER update_notes_updated_at_trigger
BEFORE UPDATE ON app.notes
FOR EACH ROW
EXECUTE FUNCTION app.update_notes_updated_at();
