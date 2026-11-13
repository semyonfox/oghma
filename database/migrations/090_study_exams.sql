SET LOCAL lock_timeout = '3s';

CREATE TABLE app.study_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    exam_at TIMESTAMPTZ NOT NULL,
    canvas_course_id BIGINT,
    study_map_id UUID,
    note_ids UUID[] CHECK (cardinality(note_ids) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_exams_owned_map_fk FOREIGN KEY (user_id, study_map_id)
        REFERENCES app.study_maps(user_id, id) ON DELETE SET NULL (study_map_id)
);
CREATE INDEX idx_study_exams_owner_date ON app.study_exams(user_id, exam_at);
CREATE INDEX idx_study_exams_map ON app.study_exams(user_id, study_map_id) WHERE study_map_id IS NOT NULL;

-- arrays cannot carry foreign keys, so check ownership and clear deleted references
CREATE FUNCTION app.check_exam_notes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    note_ref UUID;
BEGIN
    FOR note_ref IN SELECT DISTINCT unnest(NEW.note_ids) LOOP
        PERFORM note_id FROM app.notes
            WHERE user_id = NEW.user_id AND note_id = note_ref FOR KEY SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'exam notes must belong to the owner' USING ERRCODE = '23503';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER study_exams_owned_notes BEFORE INSERT OR UPDATE OF note_ids, user_id
    ON app.study_exams FOR EACH ROW EXECUTE FUNCTION app.check_exam_notes();
CREATE FUNCTION app.clear_exam_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE app.study_exams e SET note_ids = ARRAY(
        SELECT ref.id FROM unnest(e.note_ids) AS ref(id)
        JOIN app.notes n ON n.user_id = e.user_id AND n.note_id = ref.id
    ), updated_at = NOW()
    WHERE user_id = OLD.user_id AND OLD.note_id = ANY(note_ids);
    RETURN OLD;
END;
$$;
CREATE TRIGGER study_exams_clear_note AFTER DELETE ON app.notes
    FOR EACH ROW EXECUTE FUNCTION app.clear_exam_note();
