# Database Quick Fix - URGENT ACTION ITEMS

**Status:** ⚠️ CRITICAL - Schema issues will break production  
**Estimated Fix Time:** 2-3 days for immediate blockers, 5-10 days for full resolution

---

## IMMEDIATE BLOCKERS (Do This Today)

### 1. The Code References Non-Existent Column
**Problem:** Code tries to INSERT/UPDATE `deleted` column but it doesn't exist

```javascript
// This WILL FAIL:
INSERT INTO app.notes (user_id, title, content, deleted, ...)
WHERE deleted = 0
```

**Fix (Temporary - 1 hour):**
```sql
-- Add the missing column
ALTER TABLE app.notes ADD COLUMN deleted SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN shared SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN pinned SMALLINT DEFAULT 0;

-- Add index for soft delete filtering
CREATE INDEX idx_notes_deleted ON app.notes(deleted, user_id) WHERE deleted = 0;
```

### 2. Decide: INTEGER or UUID IDs?
**Problem:** Code has UUID type hints but uses parseInt() → mismatch

**Decision Required:**
- **Option A (EASY - Recommended):** Keep INTEGER, remove all UUID migration files
  - Current database: INTEGER
  - Current code: uses parseInt()
  - 2 hours to clean up
  
- **Option B (HARD):** Migrate to UUID v7
  - Better architecture
  - Complete rewrite of ID handling
  - 3-5 days of work

**Action:**
```bash
# If choosing INTEGER (recommended):
rm database/migrations/002_migrate_to_uuid_v7.sql

# Update schema.sql to match reality:
# Change all UUID to INTEGER in schema.sql
# Change note_id UUID → note_id INTEGER
# Change user_id UUID → user_id INTEGER
```

### 3. Document Current Database State
```bash
# Export actual schema from your database
psql $DATABASE_URL -c "
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'app' 
ORDER BY table_name, ordinal_position;" > db_actual_schema.txt

# Compare with schema.sql
diff db_actual_schema.txt schema.sql
```

---

## CRITICAL ISSUES (This Week)

### 4. Three Conflicting Schema Files
| File | Status | Truth? |
|------|--------|--------|
| `schema.sql` | Uses UUID | ❌ NOT in production |
| `schema-current.json` | Uses INTEGER | ✅ Current database |
| `migrations/002_migrate_to_uuid_v7.sql` | Tries UUID migration | ❌ Incomplete/broken |

**Fix:** Pick ONE source of truth and delete the others
```bash
# Option 1: Keep schema.sql as source, remove migrations
rm database/migrations/002_migrate_to_uuid_v7.sql
# Update schema.sql to use INTEGER (match reality)

# Option 2: Keep migrations, regenerate schema.sql
# Delete schema.sql
# Run: pg_dump --schema-only > schema.sql
```

### 5. Unused Tables Causing Confusion
**Problem:** `documents` and `chunks` tables exist but aren't used

```sql
-- Option A: Drop if not needed
DROP TABLE IF EXISTS app.documents;
DROP TABLE IF EXISTS app.chunks;

-- Option B: If planning RAG phase later
ALTER TABLE app.chunks ADD CONSTRAINT fk_document
  FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE CASCADE;
```

---

## HIGH PRIORITY (Next Week)

### 6. Add Composite Index for Performance
Current: Two separate indexes that are slow  
Better: One composite index
```sql
-- DELETE old single-column indexes:
DROP INDEX idx_notes_created_at;
DROP INDEX idx_notes_user_id;

-- CREATE new composite index:
CREATE INDEX idx_notes_user_created ON app.notes(user_id, created_at DESC) 
WHERE deleted = 0;
```

### 7. Fix Soft Delete Pattern
Currently: Uses `deleted` column (binary flag)  
Better: Use `deleted_at` timestamp
```sql
-- Add timestamp-based soft delete (can keep binary for compatibility)
ALTER TABLE app.notes ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Auto-cleanup job (daily)
DELETE FROM app.notes WHERE deleted_at < NOW() - INTERVAL '7 days';

-- Index for trash queries
CREATE INDEX idx_notes_trash ON app.notes(user_id, deleted_at DESC) 
WHERE deleted_at IS NOT NULL;
```

### 8. Vector Search Index
Currently: No proper index for embeddings  
Required for search to work
```sql
-- Current (suboptimal):
CREATE INDEX idx_notes_embedding_ivfflat ON app.notes 
USING ivfflat (embedding vector_cosine_ops);

-- Better (recommended):
DROP INDEX idx_notes_embedding_ivfflat;
CREATE INDEX idx_notes_embedding_hnsw ON app.notes 
USING hnsw (embedding vector_cosine_ops);
```

---

## MEDIUM PRIORITY (Before MVP Launch)

### 9. Add Missing Audit Fields
```sql
-- Track password changes
ALTER TABLE app.login ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE app.login ADD COLUMN last_login_at TIMESTAMPTZ;

-- Auto-update timestamp
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

### 10. Verify Foreign Keys Exist
```sql
-- Check current constraints
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE table_schema = 'app' AND constraint_type = 'FOREIGN KEY'
ORDER BY table_name;

-- Should have these foreign keys:
-- notes.user_id → login.user_id (CASCADE)
-- tree_items.user_id → login.user_id (CASCADE)
-- tree_items.note_id → notes.note_id (CASCADE)
-- tree_items.parent_id → tree_items.id (CASCADE)
-- attachments.note_id → notes.note_id (CASCADE)
-- pdf_annotations.user_id → login.user_id (CASCADE)
-- pdf_annotations.note_id → notes.note_id (CASCADE)
```

---

## DATABASE MIGRATION TEMPLATE

Save as: `database/migrations/003_fix_schema_consistency.sql`

```sql
-- ==============================================================================
-- Migration: Fix Critical Schema Inconsistencies
-- Date: 2025-03-08
-- Purpose: Align database with code expectations
-- ==============================================================================

-- STEP 1: Add missing columns that code expects
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS deleted SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS shared SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS pinned SMALLINT DEFAULT 0;

-- STEP 2: Add soft delete support (timestamp-based)
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- STEP 3: Drop unused tables (if not using documents/chunks for RAG)
DROP TABLE IF EXISTS app.documents CASCADE;
DROP TABLE IF EXISTS app.chunks CASCADE;

-- STEP 4: Fix indexes - remove suboptimal single-column indexes
DROP INDEX IF EXISTS idx_notes_created_at;
DROP INDEX IF EXISTS idx_notes_user_id;

-- STEP 5: Add optimal composite index
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON app.notes(user_id, created_at DESC) 
WHERE deleted = 0;

-- STEP 6: Add vector search index (proper HNSW for embeddings)
DROP INDEX IF EXISTS idx_notes_embedding;
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON app.notes 
USING hnsw (embedding vector_cosine_ops);

-- STEP 7: Add tree traversal index
CREATE INDEX IF NOT EXISTS idx_tree_user_parent ON app.tree_items(user_id, parent_id);

-- STEP 8: Add audit fields to login
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- STEP 9: Create update trigger for login.updated_at
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
FOR EACH ROW
EXECUTE FUNCTION update_login_updated_at();

-- STEP 10: Verify foreign keys exist with CASCADE delete
-- (PostgreSQL doesn't have easy way to add if not exists, so check manually)
-- Required foreign keys:
-- - notes.user_id → login.user_id ON DELETE CASCADE
-- - tree_items.user_id → login.user_id ON DELETE CASCADE
-- - tree_items.note_id → notes.note_id ON DELETE CASCADE
-- - tree_items.parent_id → tree_items.id ON DELETE CASCADE
-- - attachments.note_id → notes.note_id ON DELETE CASCADE
-- - pdf_annotations.user_id → login.user_id ON DELETE CASCADE
-- - pdf_annotations.note_id → notes.note_id ON DELETE CASCADE

-- STEP 11: Add partial indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_notes_active ON app.notes(user_id, created_at DESC) 
WHERE deleted = 0 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_trash ON app.notes(user_id, deleted_at DESC) 
WHERE deleted_at IS NOT NULL;

-- DONE!
-- Schema is now consistent with code expectations
```

---

## TESTING CHECKLIST

After applying migration, test:
```bash
# 1. Code can INSERT notes
curl -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "content": "Test note"}'
# ✅ Should succeed (previously failed on 'deleted' column)

# 2. Code can query notes
curl http://localhost:3000/api/notes
# ✅ Should return notes (no schema mismatch)

# 3. Tree operations work
curl http://localhost:3000/api/tree
# ✅ Should return tree structure

# 4. Delete operations work
curl -X DELETE http://localhost:3000/api/notes/1
# ✅ Should soft-delete (UPDATE with deleted = 1)

# 5. Database reports correct structure
psql $DATABASE_URL -c "\d app.notes"
# ✅ Should show deleted, shared, pinned columns
```

---

## RISK ASSESSMENT

**Risk Level:** 🔴 HIGH if not fixed before MVP launch

| If Not Fixed | Impact |
|--------------|--------|
| Production deployment | ❌ INSERT notes WILL FAIL (missing column) |
| Search feature | ❌ Embedding index broken |
| Delete feature | ⚠️ Works but inconsistent pattern |
| Tree operations | ⚠️ INTEGER mismatches but code uses parseInt() |
| Performance | ⚠️ Slow queries due to missing indexes |

---

## QUICK DECISION TREE

```
START HERE: Are you deployed to production?
│
├─ NO: Schema not created yet
│  └─ Use schema.sql AS-IS, choose INTEGER or UUID
│     ├─ INTEGER: Use schema.sql, delete UUID migration
│     └─ UUID: Apply UUID migration, update code
│
└─ YES: Database already exists
   └─ Check actual schema state (schema-current.json)
      ├─ If INTEGER: Stick with it, cleanup UUID files
      │  └─ Apply 003_fix_schema_consistency.sql
      │
      └─ If UUID: Complete the migration or rollback
         ├─ Complete: Finish renaming tables
         └─ Rollback: Drop v2 tables, remove migration
```

**RECOMMENDATION:** Stick with INTEGER (current reality), fix with 003 migration

---

**Last Updated:** March 8, 2025  
**Status:** Critical issues identified, actionable fixes provided  
**Estimated Fix Time:** 2-3 days for immediate blockers
