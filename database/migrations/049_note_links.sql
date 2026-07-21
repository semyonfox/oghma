-- Store resolved internal note references so backlinks are indexed and do not
-- require scanning every note body when the inspector opens.

CREATE TABLE IF NOT EXISTS app.note_links (
    user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    source_note_id UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    target_note_id UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, source_note_id, target_note_id),
    CHECK (source_note_id <> target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_target
    ON app.note_links (user_id, target_note_id);

-- `/notes/<uuid>` references are introduced with this migration, so there is
-- no legacy canonical-link corpus to scan during deployment. Rows are derived
-- when notes are created or saved.
