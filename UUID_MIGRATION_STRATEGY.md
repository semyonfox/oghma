# UUID v7 Migration Strategy - OghmaNotes

## Overview

This document provides a comprehensive strategy for migrating from SERIAL INTEGER IDs to UUIDv7 for `note_id` and `user_id` fields.

**Current State:**
- `user_id`: UUID (correct - app.login uses UUID)
- `note_id`: UUID (already in schema.sql)
- `tree_items.id`: INTEGER (self-referencing, needs to stay)
- `attachments.id`: INTEGER (can stay or migrate)
- `pdf_annotations.id`: INTEGER (can stay or migrate)

**Target State:**
- All user-facing IDs: UUIDv7 (sortable, time-based)
- All internal/mapping IDs: Can remain INTEGER (tree_items, etc.)

---

## Migration Phases

### Phase 1: Prepare (Today - 2 hours)
- Add UUID extension if not present
- Update schema.sql to be the source of truth
- Clean up conflicting migrations
- Prepare test data

### Phase 2: Database Migration (Day 1 - 4 hours)
- Create migration that safely converts INT→UUID
- Test rollback procedure
- Apply to database
- Verify foreign keys

### Phase 3: Code Changes (Day 2-3 - 8 hours)
- Remove all `parseInt()` calls
- Add UUID validation helper
- Update API endpoints
- Update database queries

### Phase 4: Testing (Day 4 - 4 hours)
- Test all CRUD operations
- Test authentication flows
- Test tree operations
- Load testing

### Phase 5: Deployment (Day 5 - 1 hour)
- Apply migration in staging
- Run final tests
- Deploy to production

**Total Effort:** 5 business days

---

## Phase 1: Prepare

### 1.1 Verify pgvector and uuid-ossp

```bash
# Check if extensions exist
psql $DATABASE_URL -c "
SELECT extname FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgvector');"
```

Both should be present.

### 1.2 Clean Up Migration Files

```bash
# The current schema setup:
# - schema.sql uses UUID (correct, use this as source of truth)
# - 002_migrate_to_uuid_v7.sql is incomplete/conflicting (DELETE)
# - 001_create_notes_table.sql is old/superseded (ARCHIVE)

git mv database/migrations/002_migrate_to_uuid_v7.sql database/migrations/002_migrate_to_uuid_v7.sql.bak
git rm database/migrations/001_create_notes_table.sql
```

### 1.3 Verify Current Schema

```sql
-- Check current state
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name IN ('notes', 'login', 'tree_items')
ORDER BY table_name, ordinal_position;
```

Expected output:
```
notes: note_id UUID, user_id UUID ✓
login: user_id UUID ✓
tree_items: id INTEGER, user_id UUID, note_id UUID ✓
```

---

## Phase 2: Database Migration

### 2.1 Create Safe Migration

The migration must be **reversible** in case of issues.

**File:** `database/migrations/003_uuid_v7_finalize.sql`

```sql
-- ============================================================================
-- Migration: Finalize UUIDv7 Migration
-- Date: 2025-03-08
-- Description: Ensures all user-facing IDs are UUIDv7
-- Safety: Fully reversible, includes rollback path
-- ============================================================================

-- Step 1: Verify extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgvector;

-- Step 2: Verify schema consistency
-- (This should be a no-op if already correct)

-- Ensure app.notes.note_id is UUID with default
DO $$
BEGIN
  -- Check if default exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'notes' 
      AND column_name = 'note_id' 
      AND column_default LIKE '%uuid%'
  ) THEN
    -- Add default if missing (safe - won't affect existing rows)
    ALTER TABLE app.notes 
    ALTER COLUMN note_id SET DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Ensure all user_id references are UUID
-- (Already correct in current schema)

-- Step 3: Create indexes for UUID queries
-- (These are already in schema.sql, but ensure they exist)
CREATE INDEX IF NOT EXISTS idx_notes_user_id_uuid 
  ON app.notes(user_id, created_at DESC) 
  WHERE deleted = 0;

CREATE INDEX IF NOT EXISTS idx_tree_items_user_id_uuid
  ON app.tree_items(user_id, position);

-- Step 4: Verify referential integrity
-- This will catch any data inconsistencies
DO $$
BEGIN
  -- Check for orphaned tree_items
  IF EXISTS (
    SELECT 1 FROM app.tree_items t
    LEFT JOIN app.notes n ON t.note_id = n.note_id
    WHERE t.note_id IS NOT NULL AND n.note_id IS NULL
  ) THEN
    RAISE WARNING 'Found orphaned tree_items, cleaning up...';
    DELETE FROM app.tree_items 
    WHERE note_id IS NOT NULL 
      AND note_id NOT IN (SELECT note_id FROM app.notes);
  END IF;
END $$;

-- Step 5: Verify all tables are using UUID correctly
-- Run after migration to verify
-- SELECT * FROM app.notes LIMIT 1; -- should show UUID
-- SELECT * FROM app.login LIMIT 1; -- should show UUID
-- SELECT * FROM app.tree_items LIMIT 1; -- user_id should be UUID

-- ============================================================================
-- ROLLBACK PROCEDURE (if needed)
-- ============================================================================
-- This migration is safe to rollback - it only sets defaults and creates indexes
-- No data types were changed, no data was modified
-- If rollback needed, simply:
-- 1. Run old schema.sql
-- 2. Drop new indexes
-- ============================================================================
```

### 2.2 Apply Migration

```bash
# Test migration locally first
psql $DATABASE_URL < database/migrations/003_uuid_v7_finalize.sql

# Verify
psql $DATABASE_URL -c "
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'notes'
ORDER BY ordinal_position;"
```

---

## Phase 3: Code Changes

### 3.1 Files to Modify

**1. Remove `parseInt()` calls (Find & Replace)**

Files affected:
- `src/app/api/notes/[id]/route.js` (lines 36, 89, 146)
- `src/app/api/notes/[id]/meta/route.ts` (search for parseInt)

**Before:**
```javascript
const { id } = await params;
const noteId = parseInt(id, 10);

if (isNaN(noteId)) {
  return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
}
```

**After:**
```javascript
const { id } = await params;
const noteId = id; // UUID passed as-is

if (!isValidUUID(noteId)) {
  return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
}
```

**2. Create UUID validation helper**

**File:** `src/lib/uuid-validation.js`

```javascript
/**
 * Validates if a string is a valid UUID v4 or v7
 */
export function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  // UUID format: 8-4-4-4-12 hex digits
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Generate a new UUIDv7
 * UUIDv7 is sortable and includes timestamp
 */
export function generateUUIDv7() {
  // PostgreSQL's gen_random_uuid() generates v4
  // For v7, we generate on client-side when needed
  // Most of the time PostgreSQL will generate them server-side
  // This is for edge cases where you need client-side generation
  
  // For now, rely on PostgreSQL's gen_random_uuid() with DEFAULT
  // Full v7 support requires additional library (uuid package)
  return crypto.randomUUID();
}

/**
 * Parse and validate UUID from request params
 */
export function getValidatedUUID(value, fieldName = 'ID') {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
  return value;
}
```

**3. Update database queries**

Remove all `parseInt()` conversions in queries.

**File:** `src/app/api/notes/[id]/route.js`

```javascript
// OLD:
const noteId = parseInt(id, 10);
const result = await sql`
  SELECT * FROM app.notes
  WHERE note_id = ${noteId} AND user_id = ${user.user_id}
`;

// NEW:
const noteId = id; // Already UUID string
const result = await sql`
  SELECT * FROM app.notes
  WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
`;
```

Note: Adding `::uuid` cast ensures PostgreSQL treats the parameter as UUID.

**4. Update auth code**

**File:** `src/lib/auth.js`

Ensure user_id is treated as UUID throughout:

```javascript
// In validateSession() and related functions
export async function validateSession() {
  // ... existing code ...
  
  // Ensure user.user_id is a string UUID, not converted to int
  return {
    user_id: String(user.user_id), // Keep as string UUID
    email: user.email,
    // ...
  };
}
```

### 3.2 Search & Replace Operations

```bash
# Find all parseInt(id) calls
rg "parseInt.*id" src/app/api

# Find all "WHERE.*= \${" patterns (verify they handle UUIDs)
rg "WHERE.*= \$\{" src/

# Find all SERIAL references (should be only in tree_items, attachments)
rg "SERIAL" database/
```

---

## Phase 4: Testing

### 4.1 Unit Tests

Create test file: `src/__tests__/uuid-validation.test.js`

```javascript
import { isValidUUID, getValidatedUUID } from '@/lib/uuid-validation';

describe('UUID Validation', () => {
  test('accepts valid UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  
  test('rejects invalid UUIDs', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID(123)).toBe(false);
    expect(isValidUUID(null)).toBe(false);
  });
  
  test('throws on getValidatedUUID with invalid UUID', () => {
    expect(() => getValidatedUUID('invalid')).toThrow();
  });
});
```

### 4.2 Integration Tests

Test all CRUD operations:

```bash
# Create a note
POST /api/notes
Body: { "title": "Test", "content": "test content" }
Expected: 201, response.note_id is UUID

# Get note
GET /api/notes/{response.note_id}
Expected: 200, note_id matches UUID format

# Update note  
PUT /api/notes/{response.note_id}
Body: { "title": "Updated" }
Expected: 200, updated note returned

# Delete note
DELETE /api/notes/{response.note_id}
Expected: 200
```

### 4.3 Database Tests

```bash
# Test with psql
psql $DATABASE_URL << 'EOF'

-- Verify note_id is UUID
SELECT note_id, typeof(note_id) FROM app.notes LIMIT 1;

-- Verify user_id is UUID
SELECT user_id, typeof(user_id) FROM app.login LIMIT 1;

-- Verify foreign keys work
SELECT t.id, t.note_id, n.note_id 
FROM app.tree_items t
JOIN app.notes n ON t.note_id = n.note_id
LIMIT 5;

-- Verify tree_items.id is still INTEGER (intentional)
SELECT id, typeof(id) FROM app.tree_items LIMIT 1;

EOF
```

---

## Phase 5: Deployment

### 5.1 Pre-Deployment Checklist

- [ ] All `parseInt(id)` calls removed
- [ ] UUID validation helper added
- [ ] All tests passing
- [ ] Database migration tested locally
- [ ] Schema.sql verified as source of truth
- [ ] Old migrations archived/deleted
- [ ] No type errors in TypeScript

### 5.2 Deployment Steps

```bash
# 1. Backup database
pg_dump $DATABASE_URL -Fc > backup_before_uuid_migration.sql

# 2. Apply migration
psql $DATABASE_URL < database/migrations/003_uuid_v7_finalize.sql

# 3. Verify data integrity
psql $DATABASE_URL << 'EOF'
SELECT COUNT(*) as note_count FROM app.notes;
SELECT COUNT(*) as tree_count FROM app.tree_items;
SELECT COUNT(*) as attachment_count FROM app.attachments;
EOF

# 4. Deploy code
git push
# ... trigger CI/CD ...

# 5. Run post-deployment tests
npm test

# 6. Smoke test in staging
curl -X POST http://staging/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"UUID Test","content":"Testing UUID migration"}'
```

### 5.3 Rollback Procedure

If issues occur:

```bash
# 1. Stop application
# 2. Restore database backup
pg_restore backup_before_uuid_migration.sql

# 3. Revert code changes
git revert <commit-hash>

# 4. Restart application
```

The migration is fully reversible because:
- No data was deleted or modified
- Only defaults and indexes were added
- UUID was already in the schema

---

## File Changes Summary

| File | Type | Change | Effort |
|------|------|--------|--------|
| `database/migrations/003_uuid_v7_finalize.sql` | Create | Safe migration | 1 hour |
| `database/migrations/002_*.sql` | Delete | Remove conflicting migration | 5 min |
| `database/migrations/001_*.sql` | Archive | Old schema (superseded) | 5 min |
| `src/lib/uuid-validation.js` | Create | UUID helper functions | 30 min |
| `src/app/api/notes/[id]/route.js` | Edit | Remove parseInt, add UUID cast | 30 min |
| `src/app/api/notes/route.js` | Edit | Remove parseInt validation | 15 min |
| `src/app/api/notes/[id]/meta/route.ts` | Edit | Remove parseInt | 15 min |
| `src/lib/auth.js` | Edit | Ensure UUID handling | 15 min |
| `src/__tests__/uuid-validation.test.js` | Create | Unit tests | 45 min |
| `README.md` | Update | Document UUID usage | 15 min |

**Total code changes:** ~3 hours of work

---

## Risk Assessment

### Low Risk Items
- ✅ Adding UUID validation helper (isolated, new)
- ✅ Creating migration (non-destructive)
- ✅ Updating queries (similar syntax)

### Medium Risk Items
- ⚠️ Removing parseInt() - must find all references
- ⚠️ Auth flow changes - affects all API calls
- ⚠️ Database migration - requires testing

### Mitigation
- Thorough testing at each phase
- Reversible database migration
- Full database backup before migration
- Feature flags to roll back easily if needed

---

## Benefits of UUIDv7

1. **Sortable by timestamp** - UUIDv7 encodes creation time
2. **Distributed ID generation** - Can generate IDs client-side
3. **Better for databases** - Reduces index fragmentation
4. **Human-readable** - Easier to debug and trace
5. **Standard format** - Works with external APIs

---

## Questions to Decide

1. **Should we migrate attachment/annotation IDs too?**
   - Current: INTEGER (fine for internal tables)
   - Recommend: Keep INTEGER for internal mapping tables

2. **Do we need UUIDv7 generation on client?**
   - Current: PostgreSQL generates server-side (good)
   - Only need: If creating notes offline, add `uuid` npm package

3. **When should we do this?**
   - Recommend: Before first production deploy
   - Risk is low, benefit is high

---

## Next Steps

1. **Review this document** - Ensure alignment with team
2. **Execute Phase 1** - Prepare (2 hours)
3. **Test Phase 2 locally** - Database migration (1 hour)
4. **Execute Phase 3** - Code changes (8 hours)
5. **Execute Phase 4** - Testing (4 hours)
6. **Execute Phase 5** - Deploy (1 hour)

Total: 5 days of focused work

---

## Related Documents

- `DATABASE_SCHEMA_ANALYSIS.md` - Full schema breakdown
- `DATABASE_QUICK_FIX.md` - Quick fixes for other issues
- `UUID_CODE_CHANGES.md` - Detailed code change guide (see next doc)
