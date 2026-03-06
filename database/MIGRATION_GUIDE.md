# Database Migration Guide: UUID v7 Implementation

## Overview

This guide is for the database team. It covers:
- Current database state vs planned migration
- Potential issues with the migration file
- Improvements to consider
- Step-by-step execution instructions

---

## Current State Analysis

### Tools Provided

**1. `scripts/map-database-schema.py`**
- Maps actual database schema to JSON
- Shows all tables, columns, types, constraints, indexes
- Output: `database/schema-current.json`

```bash
pip install psycopg2-binary
python scripts/map-database-schema.py
```

**2. `scripts/compare-schema.py`**
- Compares actual DB vs migration file
- Identifies missing/extra tables, columns, type mismatches
- Shows what migration will add/change

```bash
python scripts/compare-schema.py
```

---

## Current Migration File Analysis

Location: `database/migrations/002_migrate_to_uuid_v7.sql`

### What It Does

1. ✓ Creates UUID extension
2. ✓ Migrates `app.login.user_id` from SERIAL → UUID
3. ✓ Migrates `app.notes.note_id` from SERIAL → UUID  
4. ✓ Maintains foreign key constraints
5. ✓ Recreates indexes

### Potential Issues to Review

#### 1. **Incomplete Migration Strategy**
Current approach: Adds new UUID columns, copies data, then drops old columns.

**Issue:** If migration fails mid-way, old columns are still there but foreign keys are broken.

**Better approach:**
```sql
-- Option A: One-pass migration (requires more planning but safer)
BEGIN;
  ALTER TABLE app.notes DROP CONSTRAINT notes_user_id_fkey;
  ALTER TABLE app.login DROP CONSTRAINT login_pkey;
  
  -- Modify columns in place
  ALTER TABLE app.login ALTER COLUMN user_id TYPE UUID USING gen_random_uuid();
  -- ... etc
  
  ALTER TABLE app.login ADD CONSTRAINT login_pkey PRIMARY KEY (user_id);
  -- ... etc
COMMIT;
```

#### 2. **Data Reassignment**
Current migration reassigns all user_id values:
```sql
UPDATE app.notes SET user_id_uuid = (SELECT user_id FROM app.login LIMIT 1)
```

**Issue:** All notes get assigned to the SAME user (first one in table). This is wrong.

**Better approach:**
```sql
-- Keep foreign key relationship intact
ALTER TABLE app.notes ADD COLUMN user_id_uuid UUID;

-- Copy existing user_id relationship (needs a temp mapping)
ALTER TABLE app.login ADD COLUMN user_id_uuid UUID DEFAULT gen_random_uuid();
UPDATE app.login SET user_id_uuid = gen_random_uuid() WHERE user_id_uuid IS NULL;

-- Map notes to correct users using the temp mapping
UPDATE app.notes SET user_id_uuid = al.user_id_uuid
FROM app.login al
WHERE app.notes.user_id = al.user_id;
```

#### 3. **Missing Checks**
The migration doesn't verify:
- Number of rows before/after
- Foreign key integrity
- Index creation success

**Better approach:**
```sql
-- Before migration
SELECT COUNT(*) as total_users FROM app.login;
SELECT COUNT(*) as total_notes FROM app.notes;
SELECT COUNT(*) as orphaned_notes FROM app.notes 
WHERE user_id NOT IN (SELECT user_id FROM app.login);

-- After migration (should be zero orphaned)
SELECT COUNT(*) as orphaned_notes_after FROM app.notes 
WHERE user_id NOT IN (SELECT user_id FROM app.login);
```

#### 4. **Other Tables Not Migrated**
Current migration only handles:
- `app.login`
- `app.notes`

**Missing (need to check):**
- `app.tree_items` (if has user_id or note_id references)
- `app.attachments` (if has note_id references)
- `app.pdf_annotations` (if has note_id/user_id references)
- Any other tables with ID columns or foreign keys

---

## Schema Issues to Review

### 1. **Missing Constraints**
Check if these exist and should be added:
- [ ] Unique constraints on email in `app.login`
- [ ] NOT NULL constraints on critical columns
- [ ] Check constraints (e.g., created_at <= updated_at)

### 2. **Missing Indexes**
Consider adding:
- [ ] Index on `notes.user_id` (for filtering by user)
- [ ] Index on `notes.created_at` DESC (for sorting)
- [ ] Composite index on `(user_id, created_at DESC)`
- [ ] Full-text search index on `notes.content` (for Phase 1 search)

### 3. **Partition Strategy**
If notes table grows large (millions of rows):
- Consider partitioning by `user_id` or `created_at`
- Not critical for MVP, but useful to plan

### 4. **Audit Columns Missing**
Consider adding to `app.login` and `app.notes`:
```sql
created_by UUID REFERENCES app.login(user_id),
updated_by UUID REFERENCES app.login(user_id),
is_deleted BOOLEAN DEFAULT FALSE,
deleted_at TIMESTAMPTZ
```

---

## Execution Steps (Safe Approach)

### Phase 1: Backup & Validate

```bash
# 1. Full database backup
pg_dump $DATABASE_URL > backup-before-uuid-migration.sql

# 2. Run comparison script
python scripts/compare-schema.py

# 3. Check for orphaned records
psql $DATABASE_URL -c "
  SELECT 'orphaned notes' as issue, COUNT(*) 
  FROM app.notes 
  WHERE user_id NOT IN (SELECT user_id FROM app.login)
  UNION ALL
  SELECT 'NULL user_id in notes', COUNT(*) 
  FROM app.notes 
  WHERE user_id IS NULL;
"

# 4. Get row counts
psql $DATABASE_URL -c "
  SELECT 'app.login' as table_name, COUNT(*) as row_count FROM app.login
  UNION ALL
  SELECT 'app.notes', COUNT(*) FROM app.notes
  UNION ALL
  SELECT 'app.tree_items', COUNT(*) FROM app.tree_items
  UNION ALL
  SELECT 'app.attachments', COUNT(*) FROM app.attachments;
"
```

### Phase 2: Pre-Migration Checklist

- [ ] All references to old SERIAL IDs are migrated (check code)
- [ ] No active client connections (set maintenance mode)
- [ ] Backup complete and verified
- [ ] Comparison script shows expected gaps
- [ ] All other app.* tables identified and accounted for

### Phase 3: Run Migration

```bash
# Dry run (if using transaction)
psql $DATABASE_URL -c "BEGIN; \i database/migrations/002_migrate_to_uuid_v7.sql; ROLLBACK;"

# Actual run
psql $DATABASE_URL -f database/migrations/002_migrate_to_uuid_v7.sql

# Verify
psql $DATABASE_URL -c "
  SELECT 
    column_name, 
    data_type, 
    is_nullable 
  FROM information_schema.columns 
  WHERE table_schema = 'app' 
    AND (table_name IN ('login', 'notes'))
    AND column_name IN ('user_id', 'note_id')
  ORDER BY table_name, ordinal_position;
"
```

### Phase 4: Post-Migration Validation

```bash
# Verify data integrity
psql $DATABASE_URL -c "
  -- Check foreign keys are valid
  SELECT 'orphaned notes' as check_name, COUNT(*) as count
  FROM app.notes 
  WHERE user_id NOT IN (SELECT user_id FROM app.login);
  
  -- Check no NULLs in PK columns
  SELECT 'NULL user_id' as check_name, COUNT(*) 
  FROM app.login 
  WHERE user_id IS NULL;
  
  SELECT 'NULL note_id' as check_name, COUNT(*) 
  FROM app.notes 
  WHERE note_id IS NULL;
"

# Verify indexes exist
psql $DATABASE_URL -c "
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE schemaname = 'app' 
  ORDER BY tablename, indexname;
"

# Check extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';"
```

---

## Improvements to Consider Adding

### Short Term (Before MVP)

1. **Add Soft Delete Pattern**
   ```sql
   ALTER TABLE app.notes ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
   ALTER TABLE app.notes ADD COLUMN deleted_at TIMESTAMPTZ;
   CREATE INDEX idx_notes_not_deleted ON app.notes(user_id) WHERE NOT is_deleted;
   ```

2. **Add Audit Trail Columns**
   ```sql
   ALTER TABLE app.notes ADD COLUMN created_by UUID REFERENCES app.login(user_id);
   ALTER TABLE app.notes ADD COLUMN updated_by UUID REFERENCES app.login(user_id);
   ```

3. **Add Search Indexes (Phase 1)**
   ```sql
   ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS search_vector tsvector;
   CREATE INDEX idx_notes_search_vector ON app.notes USING GIN (search_vector);
   
   -- For semantic search (pgvector)
   CREATE EXTENSION IF NOT EXISTS vector;
   ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS embedding vector(1536);
   CREATE INDEX ON app.notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
   ```

4. **Create API Keys Table** (for encrypted API key storage)
   ```sql
   CREATE TABLE app.user_api_keys (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
       encrypted_key_blob BYTEA NOT NULL,  -- AES-256 encrypted
       provider_name TEXT NOT NULL,  -- "openai", "anthropic", etc.
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW(),
       last_used_at TIMESTAMPTZ,
       is_active BOOLEAN DEFAULT TRUE,
       UNIQUE(user_id, provider_name)
   );
   CREATE INDEX idx_user_api_keys_active ON app.user_api_keys(user_id) WHERE is_active;
   ```

### Medium Term (Phase 2+)

1. **Partitioning** - if notes table grows > 1M rows
2. **Read replicas** - for search-heavy workloads
3. **Materialized views** - for analytics aggregations
4. **Connection pooling** - via PgBouncer for scaling

---

## Rollback Plan

If migration fails:

```bash
# From backup
psql $DATABASE_URL < backup-before-uuid-migration.sql

# Or individual table rollback
psql $DATABASE_URL -c "
  -- If notes table has extra columns
  ALTER TABLE app.notes DROP COLUMN IF EXISTS note_id_uuid;
  ALTER TABLE app.notes DROP COLUMN IF EXISTS user_id_uuid;
  
  -- Restore foreign keys
  ALTER TABLE app.notes 
    ADD CONSTRAINT notes_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES app.login(user_id) ON DELETE CASCADE;
"
```

---

## Questions for Code Team

Before running migration, confirm:

1. [ ] All API routes use UUID format for IDs?
2. [ ] No hardcoded SERIAL ID assumptions in code?
3. [ ] Frontend handles UUIDs in URLs properly?
4. [ ] Any ORM migrations needed (Prisma, TypeORM, etc)?

---

## For Next Steps

After migration is complete:

1. Update `docs/SRS.tex` section on database schema with new UUID info
2. Add `app.user_api_keys` table for Phase 2 encrypted key storage
3. Add search indexes when Phase 1 search begins
4. Document all ID generation now uses `generateUUID()` from `src/lib/utils/uuid.ts`

---

## Contact Points

- **Code:** See `src/lib/utils/uuid.ts` for UUID generation
- **Docs:** See `database/schema.sql` for canonical schema definition
- **Migrations:** See `database/migrations/` directory

---

Generated: 2025-03-06
For: Database team during Phase 1 implementation
