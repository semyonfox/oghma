SET LOCAL lock_timeout = '3s';

ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS extracted_from_note_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'app.notes'::regclass AND conname = 'notes_owned_extraction_source_fk'
    ) THEN
        ALTER TABLE app.notes ADD CONSTRAINT notes_owned_extraction_source_fk
            FOREIGN KEY (user_id, extracted_from_note_id) REFERENCES app.notes(user_id, note_id)
            ON DELETE SET NULL (extracted_from_note_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'app.notes'::regclass AND conname = 'notes_extraction_source_not_self'
    ) THEN
        ALTER TABLE app.notes ADD CONSTRAINT notes_extraction_source_not_self
            CHECK (extracted_from_note_id <> note_id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_notes_extraction_source
    ON app.notes (user_id, extracted_from_note_id) WHERE extracted_from_note_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.study_maps (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    name               TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    academic_year      TEXT NOT NULL CHECK (length(btrim(academic_year)) BETWEEN 1 AND 40),
    root_note_id       UUID,
    canvas_course_id   TEXT CHECK (canvas_course_id ~ '^[0-9]{1,30}$'),
    syllabus_note_id   UUID,
    topics             JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(topics) = 'array'),
    taxonomy_version   INTEGER NOT NULL DEFAULT 1 CHECK (taxonomy_version >= 1),
    version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    board_version      INTEGER NOT NULL DEFAULT 0 CHECK (board_version >= 0),
    board              JSONB NOT NULL DEFAULT '{"placements":[],"links":[],"viewport":null}'::jsonb
                       CHECK (jsonb_typeof(board) = 'object'),
    auto_classify      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, id),
    -- clearing a deleted source must preserve the map and its owner
    CONSTRAINT study_maps_owned_root_fk
        FOREIGN KEY (user_id, root_note_id) REFERENCES app.notes(user_id, note_id)
        ON DELETE SET NULL (root_note_id),
    CONSTRAINT study_maps_owned_syllabus_fk
        FOREIGN KEY (user_id, syllabus_note_id) REFERENCES app.notes(user_id, note_id)
        ON DELETE SET NULL (syllabus_note_id)
);

CREATE INDEX IF NOT EXISTS idx_study_maps_owner_updated
    ON app.study_maps (user_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_study_maps_root
    ON app.study_maps (user_id, root_note_id) WHERE root_note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_study_maps_syllabus
    ON app.study_maps (user_id, syllabus_note_id) WHERE syllabus_note_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.study_materials (
    map_id             UUID NOT NULL,
    user_id            UUID NOT NULL,
    note_id            UUID NOT NULL,
    excluded           BOOLEAN NOT NULL DEFAULT FALSE,
    kind               TEXT NOT NULL DEFAULT 'other'
                       CHECK (kind IN ('notes', 'slides', 'syllabus', 'past_paper', 'worked_example', 'reading', 'other')),
    labels             TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(labels) <= 20),
    associations       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(associations) = 'array'),
    overrides          JSONB NOT NULL DEFAULT '{"topics":{},"sourceHash":"","taxonomyVersion":0}'::jsonb
                       CHECK (jsonb_typeof(overrides) = 'object'),
    source_hash        TEXT NOT NULL DEFAULT '' CHECK (source_hash = '' OR source_hash ~ '^[a-f0-9]{64}$'),
    taxonomy_version   INTEGER NOT NULL DEFAULT 0 CHECK (taxonomy_version >= 0),
    status             TEXT NOT NULL DEFAULT 'unclassified'
                       CHECK (status IN ('unclassified', 'classified', 'stale', 'failed')),
    classification     JSONB CHECK (jsonb_typeof(classification) = 'object'),
    classified_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (map_id, note_id),
    UNIQUE (map_id, user_id, note_id),
    CONSTRAINT study_materials_owned_map_fk
        FOREIGN KEY (user_id, map_id) REFERENCES app.study_maps(user_id, id) ON DELETE CASCADE,
    CONSTRAINT study_materials_owned_note_fk
        FOREIGN KEY (user_id, note_id) REFERENCES app.notes(user_id, note_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_materials_owner_note
    ON app.study_materials (user_id, note_id, map_id);

CREATE TABLE IF NOT EXISTS app.study_papers (
    map_id             UUID NOT NULL,
    user_id            UUID NOT NULL,
    note_id            UUID NOT NULL,
    source_hash        TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
    taxonomy_version   INTEGER NOT NULL CHECK (taxonomy_version >= 0),
    reviewed           BOOLEAN NOT NULL DEFAULT FALSE,
    structure          JSONB NOT NULL CHECK (jsonb_typeof(structure) = 'object'),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (map_id, note_id),
    CONSTRAINT study_papers_owned_material_fk
        FOREIGN KEY (map_id, user_id, note_id)
        REFERENCES app.study_materials(map_id, user_id, note_id) ON DELETE CASCADE,
    CONSTRAINT study_papers_owned_map_fk
        FOREIGN KEY (user_id, map_id) REFERENCES app.study_maps(user_id, id) ON DELETE CASCADE,
    CONSTRAINT study_papers_owned_note_fk
        FOREIGN KEY (user_id, note_id) REFERENCES app.notes(user_id, note_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_papers_owner_note
    ON app.study_papers (user_id, note_id, map_id);

CREATE TABLE IF NOT EXISTS app.study_jobs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL,
    map_id             UUID NOT NULL,
    note_id            UUID,
    kind               TEXT NOT NULL CHECK (kind IN ('taxonomy', 'classify', 'paper')),
    state              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (state IN ('pending', 'running', 'completed', 'failed')),
    attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    lease_until        TIMESTAMPTZ,
    lease_token        UUID,
    error              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_jobs_owned_map_fk
        FOREIGN KEY (user_id, map_id) REFERENCES app.study_maps(user_id, id) ON DELETE CASCADE,
    CONSTRAINT study_jobs_owned_note_fk
        FOREIGN KEY (user_id, note_id) REFERENCES app.notes(user_id, note_id) ON DELETE CASCADE,
    CHECK ((kind = 'taxonomy' AND note_id IS NULL) OR (kind IN ('classify', 'paper') AND note_id IS NOT NULL)),
    CHECK ((lease_until IS NULL) = (lease_token IS NULL)),
    CHECK (state = 'running' OR (lease_until IS NULL AND lease_token IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_study_jobs_active
    ON app.study_jobs (map_id, kind, COALESCE(note_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE state IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_study_jobs_pending
    ON app.study_jobs (created_at, id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS idx_study_jobs_running_lease
    ON app.study_jobs (lease_until, id) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS idx_study_jobs_owner_map
    ON app.study_jobs (user_id, map_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_study_jobs_owner_note
    ON app.study_jobs (user_id, note_id) WHERE note_id IS NOT NULL;
