# Final Schema Design - UUIDv7 & Optimization

## Current vs. Target Schema

### app.notes (CORE)

**Current:**
```
note_id       UUID                DEFAULT gen_random_uuid()
user_id       UUID                REFERENCES app.login(user_id)
title         TEXT                NOT NULL
content       TEXT
s3_key        TEXT                (unused)
extracted_text TEXT               (unused)
embedding     vector(1536)        (unused)
deleted       SMALLINT DEFAULT 0  ✅ (just added)
shared        SMALLINT DEFAULT 0  ✅ (just added)
created_at    TIMESTAMPTZ         DEFAULT now()
updated_at    TIMESTAMPTZ         DEFAULT now()
```

**Issues:**
- ❌ `s3_key`, `extracted_text`, `embedding` - Planned but not used
- ✅ `deleted`, `shared` - Just added (good)
- ⚠️ Soft delete needs `deleted_at` timestamp for 7-day retention

**Target:**
```
note_id       UUID                DEFAULT gen_random_uuid() ✅
user_id       UUID                REFERENCES app.login(user_id) ✅
title         TEXT                NOT NULL
content       TEXT
deleted       SMALLINT DEFAULT 0  ✅
deleted_at    TIMESTAMPTZ DEFAULT NULL  (NEW - for soft delete)
shared        SMALLINT DEFAULT 0  ✅
pinned        SMALLINT DEFAULT 0  (optional)
created_at    TIMESTAMPTZ         DEFAULT now()
updated_at    TIMESTAMPTZ         DEFAULT now()
```

**Action:**
- Add `deleted_at TIMESTAMPTZ DEFAULT NULL` column
- Create cleanup job: `DELETE FROM app.notes WHERE deleted_at < NOW() - INTERVAL '7 days'`
- Remove unused columns (s3_key, extracted_text, embedding) OR clarify purpose

---

### app.login (USER AUTH)

**Current:**
```
user_id               UUID             DEFAULT gen_random_uuid()
email                 TEXT             NOT NULL UNIQUE
hashed_password       TEXT             NOT NULL
reset_token           VARCHAR
reset_token_expires   TIMESTAMPTZ
created_at            TIMESTAMPTZ      DEFAULT now()
```

**Issues:**
- ⚠️ Missing `updated_at` (for tracking password changes)
- ⚠️ Missing `last_login_at` (for security/analytics)
- ⚠️ Missing `status` (for deactivated accounts)

**Target:**
```
user_id               UUID             DEFAULT gen_random_uuid()
email                 TEXT             NOT NULL UNIQUE
hashed_password       TEXT             NOT NULL
reset_token           VARCHAR
reset_token_expires   TIMESTAMPTZ
status                SMALLINT DEFAULT 1  (NEW - 1=active, 0=deactivated)
last_login_at         TIMESTAMPTZ          (NEW)
updated_at            TIMESTAMPTZ      DEFAULT now() (NEW)
created_at            TIMESTAMPTZ      DEFAULT now()
```

**Action:**
```sql
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS status SMALLINT DEFAULT 1;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Auto-update timestamp on password change
CREATE OR REPLACE FUNCTION update_login_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_login_updated_at
BEFORE UPDATE ON app.login
FOR EACH ROW EXECUTE FUNCTION update_login_updated_at();
```

---

### app.tree_items (FILE HIERARCHY)

**Current:**
```
id          INTEGER    PRIMARY KEY (SERIAL)
user_id     UUID       REFERENCES app.login
note_id     UUID       REFERENCES app.notes (can be NULL for folders)
parent_id   INTEGER    REFERENCES app.tree_items (self-referencing)
is_expanded BOOLEAN    DEFAULT false
position    INTEGER    DEFAULT 0
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

**Status:** ✅ **Good as-is**

**Why keep INTEGER for id:**
- Internal table (never exposed to API)
- Self-referencing (easier with auto-increment)
- Tree traversal queries faster with integer
- SERIAL is battle-tested

**Indexes:** ✅ Present
- `idx_tree_items_user_id`
- `idx_tree_items_note_id`
- `idx_tree_items_parent_id`

**Improvements:**
```sql
-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_tree_items_user_position 
ON app.tree_items(user_id, position) WHERE note_id IS NOT NULL;

-- Add index for folder traversal
CREATE INDEX IF NOT EXISTS idx_tree_items_parent_user
ON app.tree_items(parent_id, user_id);
```

---

### app.attachments (PDF/FILE STORAGE)

**Current:**
```
id        INTEGER    PRIMARY KEY (SERIAL)
note_id   UUID       REFERENCES app.notes
filename  TEXT       NOT NULL
s3_key    TEXT       NOT NULL (S3 storage location)
mime_type VARCHAR
size      INTEGER
created_at TIMESTAMPTZ DEFAULT now()
```

**Status:** ✅ **Good as-is**

**Potential additions:**
```sql
-- Track who uploaded
ALTER TABLE app.attachments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app.login;

-- Track modification
ALTER TABLE app.attachments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE app.attachments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
```

---

### app.pdf_annotations (PDF MARKUP)

**Current:**
```
id              INTEGER    PRIMARY KEY (SERIAL)
note_id         UUID       REFERENCES app.notes
user_id         UUID       REFERENCES app.login
attachment_id   INTEGER    REFERENCES app.attachments
annotation_data JSONB
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

**Status:** ✅ **Good as-is**

---

### app.documents (UNUSED - DECISION NEEDED)

**Current:** EXISTS but NOT USED

```
id         UUID          DEFAULT gen_random_uuid()
user_id    UUID          REFERENCES app.login
filename   VARCHAR       NOT NULL
s3_key     VARCHAR       NOT NULL
uploaded_at TIMESTAMPTZ  DEFAULT now()
```

**Decision:**
- **Option A (Recommended):** DROP - Overlaps with attachments
- **Option B:** Keep for future RAG phase
- **Option C:** Merge into attachments

**Recommendation:** DROP for MVP, add later if needed

```bash
# To drop:
DROP TABLE app.documents CASCADE;

# To keep (add foreign key to chunks):
ALTER TABLE app.chunks ADD CONSTRAINT fk_chunks_document
FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE CASCADE;
```

---

### app.chunks (UNUSED - DECISION NEEDED)

**Current:** EXISTS but NOT USED

```
id        UUID                DEFAULT gen_random_uuid()
user_id   UUID                REFERENCES app.login
document_id UUID              REFERENCES app.documents (orphaned)
text      TEXT                NOT NULL
embedding vector(1536)        (pgvector - HNSW index)
page_number INTEGER
section   VARCHAR
created_at TIMESTAMPTZ        DEFAULT now()
```

**Status:** 
- ❌ `document_id` is orphaned (documents table unused)
- ✅ Vector index exists and is correct (HNSW)
- ❌ Not integrated into notes/search flow

**Decision:**
- **Option A (Recommended):** DROP - Phase 2 RAG feature
- **Option B:** Repurpose as embeddings for notes

**Recommendation:** DROP for MVP, implement proper embeddings in notes table later

```bash
# To drop:
DROP TABLE app.chunks CASCADE;

# Or if keeping for Phase 2, clean up orphans:
DELETE FROM app.chunks WHERE document_id NOT IN (SELECT id FROM app.documents);
```

---

## Final Schema (Post-UUID Migration)

### Tables to Keep
1. ✅ `app.login` - Users (with updated_at, last_login_at)
2. ✅ `app.notes` - Notes (with deleted_at)
3. ✅ `app.tree_items` - File hierarchy
4. ✅ `app.attachments` - PDFs and files
5. ✅ `app.pdf_annotations` - PDF markup

### Tables to Drop
1. ❌ `app.documents` - Unused, overlaps attachments
2. ❌ `app.chunks` - Unused, for future RAG

### Key Characteristics

| Aspect | Design |
|--------|--------|
| **User IDs** | UUIDv7 (sortable, unique across instances) |
| **Note IDs** | UUIDv7 (sortable, generated server-side) |
| **Internal IDs** | INTEGER SERIAL (tree_items, attachments, pdf_annotations) |
| **Soft Delete** | `deleted_at TIMESTAMPTZ` with 7-day retention |
| **Timestamps** | TIMESTAMPTZ (includes timezone) |
| **Vectors** | pgvector with HNSW index (for future Phase 2) |
| **Storage** | S3 via s3_key field |

---

## Migration SQL: Complete Schema Finalization

**File:** `database/migrations/004_schema_finalization.sql`

```sql
-- ============================================================================
-- Migration: Schema Finalization - UUIDv7 + Soft Delete + Cleanup
-- Date: 2025-03-08
-- Description: Final schema adjustments after UUID migration
-- ============================================================================

-- ============================================================================
-- PART 1: Cleanup Unused Tables
-- ============================================================================
-- These were planned but not integrated; will revisit in Phase 2 (RAG)
DROP TABLE IF EXISTS app.chunks CASCADE;
DROP TABLE IF EXISTS app.documents CASCADE;

-- ============================================================================
-- PART 2: Add Soft Delete Support (notes table)
-- ============================================================================
ALTER TABLE app.notes 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Composite index for trash/deleted notes queries
CREATE INDEX IF NOT EXISTS idx_notes_trash 
ON app.notes(user_id, deleted_at DESC) 
WHERE deleted_at IS NOT NULL;

-- Update existing index to only active notes
DROP INDEX IF EXISTS idx_notes_deleted;
CREATE INDEX IF NOT EXISTS idx_notes_user_created 
ON app.notes(user_id, created_at DESC) 
WHERE deleted = 0 AND deleted_at IS NULL;

-- ============================================================================
-- PART 3: Enhance Login Table (audit + security)
-- ============================================================================
ALTER TABLE app.login
ADD COLUMN IF NOT EXISTS status SMALLINT DEFAULT 1;
  -- 1 = active, 0 = deactivated, 2 = suspended

ALTER TABLE app.login
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE app.login
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Auto-update timestamp on changes
CREATE OR REPLACE FUNCTION update_login_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_login_updated_at ON app.login;
CREATE TRIGGER update_login_updated_at
BEFORE UPDATE ON app.login
FOR EACH ROW EXECUTE FUNCTION update_login_updated_at();

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_login_status 
ON app.login(status) 
WHERE status = 1;

-- ============================================================================
-- PART 4: Optimize Tree Traversal
-- ============================================================================
-- Composite index for getting children
CREATE INDEX IF NOT EXISTS idx_tree_items_parent_position
ON app.tree_items(parent_id, position)
WHERE note_id IS NOT NULL;

-- Composite index for user trees
CREATE INDEX IF NOT EXISTS idx_tree_items_user_parent
ON app.tree_items(user_id, parent_id);

-- ============================================================================
-- PART 5: Verify Foreign Keys
-- ============================================================================
-- These should all exist, but verify:
-- app.notes.user_id → app.login.user_id (CASCADE)
-- app.tree_items.user_id → app.login.user_id (CASCADE)
-- app.tree_items.note_id → app.notes.note_id (CASCADE)
-- app.attachments.note_id → app.notes.note_id (CASCADE)
-- app.pdf_annotations.user_id → app.login.user_id (CASCADE)
-- app.pdf_annotations.note_id → app.notes.note_id (CASCADE)

-- ============================================================================
-- PART 6: Cleanup Job Setup
-- ============================================================================
-- For 7-day soft delete retention (as per SRS)
-- Run daily via scheduled job or application cron:
-- DELETE FROM app.notes WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';

-- Comment for reference:
COMMENT ON COLUMN app.notes.deleted_at IS 
'Soft delete timestamp. Rows with deleted_at set will be permanently deleted 7 days after this timestamp. NULL = active note.';

-- ============================================================================
-- PART 7: Verify Final Schema
-- ============================================================================
-- Run after migration to verify:
-- SELECT column_name, data_type 
-- FROM information_schema.columns
-- WHERE table_schema = 'app' AND table_name = 'notes'
-- ORDER BY ordinal_position;
--
-- Expected columns:
-- title, content, created_at, updated_at, note_id (UUID), user_id (UUID),
-- deleted (SMALLINT), shared (SMALLINT), deleted_at (TIMESTAMPTZ)

```

---

## Index Summary

### All Recommended Indexes

```sql
-- app.notes (ACTIVE/DELETED QUERIES)
CREATE INDEX idx_notes_user_created ON app.notes(user_id, created_at DESC) WHERE deleted = 0;
CREATE INDEX idx_notes_trash ON app.notes(user_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_notes_user_id ON app.notes(user_id);
CREATE INDEX idx_notes_created_at ON app.notes(created_at DESC);

-- app.tree_items (TREE TRAVERSAL)
CREATE INDEX idx_tree_items_user_id ON app.tree_items(user_id);
CREATE INDEX idx_tree_items_note_id ON app.tree_items(note_id);
CREATE INDEX idx_tree_items_parent_position ON app.tree_items(parent_id, position);
CREATE INDEX idx_tree_items_user_parent ON app.tree_items(user_id, parent_id);

-- app.login (USER QUERIES)
CREATE INDEX idx_login_email ON app.login(email);
CREATE INDEX idx_login_status ON app.login(status) WHERE status = 1;

-- app.attachments (PDF STORAGE)
CREATE INDEX idx_attachments_note_id ON app.attachments(note_id);

-- app.pdf_annotations (ANNOTATIONS)
CREATE INDEX idx_pdf_annotations_note_id ON app.pdf_annotations(note_id);
CREATE INDEX idx_pdf_annotations_user_id ON app.pdf_annotations(user_id);
```

---

## Entity Relationship Diagram

```
┌─────────────┐
│  app.login  │  (Users)
│  ────────── │
│  user_id   │ (UUID, PK)
│  email      │ (UNIQUE)
│  password   │
│  status     │
│  created_at │
│  updated_at │
│  last_login │
└─────────────┘
      ↓ (user_id FK)
      ↓
┌─────────────┐        ┌──────────────┐
│  app.notes  │────┬───│ app.attachments
│  ───────── │    │   │ ──────────────
│  note_id   │ ───┤   │  id (SERIAL)
│  user_id   │    │   │  note_id (FK→notes)
│  title     │    │   │  filename
│  content   │    │   │  s3_key
│  deleted   │    │   │  mime_type
│  deleted_at│    │   │  created_at
│  shared    │    │   │
│  created_at│    │   │
└─────────────┘    │   └──────────────
      ↓ (note_id FK)
      ↓            │
┌──────────────────┤
│  app.tree_items  │
│  ──────────────  │
│  id (SERIAL)     │
│  user_id (FK)    │
│  note_id (FK) ───┘
│  parent_id (FK→self)
│  position
│  is_expanded
└──────────────────┘
      ↑ (FK)
      │
      ├─────────────┬───────────────┐
      │             │               │
      │       ┌──────────────────┐  │
      │       │ app.pdf_annotations
      │       │ ─────────────────
      └───────│ id (SERIAL)       │
              │ note_id (FK)      │
              │ user_id (FK)      │
              │ attachment_id (FK)│
              │ annotation_data   │
              │ created_at        │
              │ updated_at        │
              └──────────────────┘
```

---

## Data Types Summary

| Type | Usage | Reason |
|------|-------|--------|
| `UUID` | user_id, note_id | Distributed generation, sortable with v7, prevents enumeration attacks |
| `INTEGER (SERIAL)` | Internal IDs (tree_items.id, attachments.id) | Fast for internal lookups, never exposed to API |
| `TEXT` | titles, content | Unlimited length, PostgreSQL optimized |
| `TIMESTAMPTZ` | Timestamps | Includes timezone, better for distributed systems |
| `JSONB` | Annotations, metadata | Queryable, indexed efficiently |
| `vector(1536)` | Embeddings | OpenAI embeddings size, pgvector optimized |
| `SMALLINT` | Flags (deleted, shared, status) | Efficient storage for 0/1 flags |

---

## Performance Characteristics

### Query Performance (After Optimization)

| Query | Indexes Used | Estimated Rows |
|-------|-------------|-----------------|
| Get user's notes (not deleted) | idx_notes_user_created | O(log n) |
| Get user's trash | idx_notes_trash | O(log n) |
| Get note tree | idx_tree_items_user_id | O(k log n) (k children) |
| Get tree children | idx_tree_items_parent_position | O(log n + k) |
| Get note attachments | idx_attachments_note_id | O(log n) |
| Get user by email | idx_login_email | O(log n) |

All queries should complete in <10ms for realistic data sizes.

---

## Next Steps

1. ✅ **Phase 1:** UUID validation helper created
2. 📋 **Phase 2:** Database migration (schema-final.sql)
3. 📝 **Phase 3:** Code changes (follow UUID_CODE_CHANGES.md)
4. ✅ **Phase 4:** Testing (test suite outlined)
5. 🚀 **Phase 5:** Deploy

See `UUID_MIGRATION_STRATEGY.md` for detailed phase breakdown.
