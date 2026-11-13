SET LOCAL lock_timeout = '3s';

ALTER TABLE app.quiz_questions
    ALTER COLUMN chunk_id DROP NOT NULL,
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'generated',
    ADD COLUMN source_quote TEXT,
    ADD COLUMN source_section TEXT,
    ADD CONSTRAINT quiz_questions_origin_check
        CHECK (origin IN ('generated', 'manual', 'section', 'anki')) NOT VALID,
    ADD CONSTRAINT quiz_questions_generated_chunk_check
        CHECK (origin <> 'generated' OR chunk_id IS NOT NULL) NOT VALID;
