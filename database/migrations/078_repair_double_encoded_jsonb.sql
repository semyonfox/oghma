-- 078_repair_double_encoded_jsonb.sql
-- postgres.js serializes a string bound to ::jsonb as a JSON string, so writes
-- that passed JSON.stringify(...)::jsonb stored strings containing JSON. The
-- Canvas cache clone then re-stringified those strings, nesting them further.
-- Unwrap every layer that still parses as JSON. A genuine string value stops
-- the loop because its inner text is not valid JSON.

CREATE FUNCTION pg_temp.unwrap_jsonb(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    current jsonb := value;
BEGIN
    WHILE jsonb_typeof(current) = 'string' LOOP
        BEGIN
            current := (current #>> '{}')::jsonb;
        EXCEPTION WHEN invalid_text_representation THEN
            RETURN current;
        END;
    END LOOP;
    RETURN current;
END
$$;

UPDATE app.canvas_import_jobs
SET course_ids = pg_temp.unwrap_jsonb(course_ids)
WHERE jsonb_typeof(course_ids) = 'string';

UPDATE app.notes
SET extraction_coverage = NULLIF(pg_temp.unwrap_jsonb(extraction_coverage), 'null'::jsonb)
WHERE jsonb_typeof(extraction_coverage) = 'string';

UPDATE app.imported_file_cache
SET extraction_coverage = NULLIF(pg_temp.unwrap_jsonb(extraction_coverage), 'null'::jsonb)
WHERE jsonb_typeof(extraction_coverage) = 'string';

UPDATE app.quiz_questions
SET options = pg_temp.unwrap_jsonb(options)
WHERE jsonb_typeof(options) = 'string';

UPDATE app.quiz_sessions
SET filter_value = pg_temp.unwrap_jsonb(filter_value)
WHERE jsonb_typeof(filter_value) = 'string';

UPDATE app.user_streaks
SET streak_milestones = pg_temp.unwrap_jsonb(streak_milestones)
WHERE jsonb_typeof(streak_milestones) = 'string';

UPDATE app.canvas_planner_items
SET raw_planner_item = pg_temp.unwrap_jsonb(raw_planner_item)
WHERE jsonb_typeof(raw_planner_item) = 'string';

UPDATE app.canvas_planner_items
SET raw_plannable = NULLIF(pg_temp.unwrap_jsonb(raw_plannable), 'null'::jsonb)
WHERE jsonb_typeof(raw_plannable) = 'string';
