-- change notifications for /api/events. every app process LISTENs on
-- oghma_events and relays each payload to that user's open tabs, which then
-- refetch through the normal routes. payloads only say what changed, never
-- content. triggers catch writes from routes and workers alike, so no code
-- path can forget to publish. postgres drops identical payloads within one
-- transaction, so a bulk import collapses to one event per parent folder
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION app.notify_tree_item_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM pg_notify('oghma_events', json_build_object(
            't', 'tree', 'u', OLD.user_id, 'p', OLD.parent_id)::text);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM pg_notify('oghma_events', json_build_object(
            't', 'tree', 'u', NEW.user_id, 'p', NEW.parent_id)::text);
    END IF;
    RETURN NULL;
END;
$$;

-- is_expanded is left out: each tab keeps its own expansion state
CREATE TRIGGER tree_items_notify AFTER INSERT OR DELETE OR UPDATE OF parent_id
    ON app.tree_items FOR EACH ROW EXECUTE FUNCTION app.notify_tree_item_change();

-- the columns a tree row shows. edited_at moves on every autosave, so only the
-- first edit after a quiet spell notifies: that is enough to reorder a tree
-- sorted by recent edits without refetching a branch on every keystroke
CREATE OR REPLACE FUNCTION app.notify_note_tree_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    parent UUID;
BEGIN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
        AND NEW.is_folder IS NOT DISTINCT FROM OLD.is_folder
        AND NEW.s3_key IS NOT DISTINCT FROM OLD.s3_key
        AND NEW.pinned IS NOT DISTINCT FROM OLD.pinned
        AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
        AND NEW.canvas_module_position IS NOT DISTINCT FROM OLD.canvas_module_position
        AND NEW.course_finished_override IS NOT DISTINCT FROM OLD.course_finished_override
        AND NEW.canvas_academic_year IS NOT DISTINCT FROM OLD.canvas_academic_year
        AND (NEW.edited_at IS NULL
            OR NEW.edited_at < COALESCE(OLD.edited_at, '-infinity') + INTERVAL '5 minutes')
    THEN
        RETURN NULL;
    END IF;
    SELECT tree.parent_id INTO parent FROM app.tree_items tree
    WHERE tree.note_id = NEW.note_id AND tree.user_id = NEW.user_id;
    IF FOUND THEN
        PERFORM pg_notify('oghma_events', json_build_object(
            't', 'tree', 'u', NEW.user_id, 'p', parent)::text);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER notes_tree_notify AFTER UPDATE OF title, is_folder, s3_key, pinned, deleted_at,
    edited_at, canvas_module_position, course_finished_override, canvas_academic_year
    ON app.notes FOR EACH ROW EXECUTE FUNCTION app.notify_note_tree_change();

-- study map progress and jobs. study_jobs lease renewals are not state changes
CREATE OR REPLACE FUNCTION app.notify_study_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM pg_notify('oghma_events', json_build_object(
            't', 'study', 'u', OLD.user_id, 'm', OLD.map_id)::text);
    ELSE
        PERFORM pg_notify('oghma_events', json_build_object(
            't', 'study', 'u', NEW.user_id, 'm', NEW.map_id)::text);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER study_materials_notify AFTER INSERT OR DELETE OR UPDATE OF status, excluded
    ON app.study_materials FOR EACH ROW EXECUTE FUNCTION app.notify_study_change();
CREATE TRIGGER study_jobs_notify AFTER INSERT OR DELETE OR UPDATE OF state
    ON app.study_jobs FOR EACH ROW EXECUTE FUNCTION app.notify_study_change();

-- canvas, vault and export jobs share canvas_import_jobs. claim renewals only
-- touch claim_expires_at and updated_at, so they stay quiet
CREATE OR REPLACE FUNCTION app.notify_import_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('oghma_events', json_build_object(
        't', 'jobs', 'u', CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END)::text);
    RETURN NULL;
END;
$$;

CREATE TRIGGER canvas_import_jobs_notify AFTER INSERT OR DELETE OR UPDATE OF status,
    discovery_progress, expected_total, completed_at, error_message, result_summary, download_url
    ON app.canvas_import_jobs FOR EACH ROW EXECUTE FUNCTION app.notify_import_change();
CREATE TRIGGER canvas_imports_notify AFTER INSERT OR DELETE OR UPDATE OF status, note_id
    ON app.canvas_imports FOR EACH ROW EXECUTE FUNCTION app.notify_import_change();
