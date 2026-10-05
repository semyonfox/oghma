SET LOCAL lock_timeout = '3s';

-- content-addressed study results shared across users, like the imported file cache.
-- keys hash the model, prompt version, question and exact source text, so identical
-- files imported by several students are classified or proposed once
CREATE TABLE IF NOT EXISTS app.study_decision_cache (
    key        TEXT PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
    value      JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.study_generation_cache (
    key        TEXT PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
    value      JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- public module descriptors, refetched after they age out
CREATE TABLE IF NOT EXISTS app.module_descriptors (
    code       TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2,4}[0-9]{3,4}[A-Z]?$'),
    body       TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
