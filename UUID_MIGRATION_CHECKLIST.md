# UUID v7 Migration - Execution Checklist

Quick reference for executing the UUID v7 migration.

---

## Phase 1: Prepare (Today - ~2 hours)

- [ ] Read `UUID_MIGRATION_STRATEGY.md` (10 min)
- [ ] Review database schema: `UUID_SCHEMA_FINAL.md` (10 min)
- [ ] Verify PostgreSQL extensions

```bash
psql $DATABASE_URL -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgvector');"
```

Expected: Both present ✅

- [ ] Clean up old migrations

```bash
git mv database/migrations/002_migrate_to_uuid_v7.sql database/migrations/002_migrate_to_uuid_v7.sql.bak
git rm database/migrations/001_create_notes_table.sql
```

- [ ] Verify current schema

```bash
psql $DATABASE_URL << 'EOF'
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name IN ('notes', 'login', 'tree_items')
ORDER BY table_name, ordinal_position;
EOF
```

Expected:
```
notes: note_id UUID, user_id UUID ✅
login: user_id UUID ✅
tree_items: user_id UUID, note_id UUID, id SERIAL ✅
```

- [ ] Create database backup

```bash
pg_dump $DATABASE_URL -Fc > backup_before_uuid_migration_$(date +%Y%m%d).sql
```

Store safely!

- [ ] Create migration file: `database/migrations/003_uuid_v7_finalize.sql`

(Use SQL from `UUID_SCHEMA_FINAL.md`)

- [ ] Create migration file: `database/migrations/004_schema_finalization.sql`

(Use SQL from `UUID_SCHEMA_FINAL.md`)

- [ ] Test migrations locally

```bash
psql $DATABASE_URL < database/migrations/003_uuid_v7_finalize.sql
psql $DATABASE_URL < database/migrations/004_schema_finalization.sql
```

No errors? ✅

---

## Phase 2: Database Migration (Day 1 - ~1 hour)

- [ ] Apply migration to staging database

```bash
psql $STAGING_DATABASE_URL < database/migrations/003_uuid_v7_finalize.sql
psql $STAGING_DATABASE_URL < database/migrations/004_schema_finalization.sql
```

- [ ] Verify integrity

```bash
psql $DATABASE_URL << 'EOF'
-- Verify no orphaned tree items
SELECT COUNT(*) FROM app.tree_items t
LEFT JOIN app.notes n ON t.note_id = n.note_id
WHERE t.note_id IS NOT NULL AND n.note_id IS NULL;

-- Verify no orphaned attachments
SELECT COUNT(*) FROM app.attachments a
LEFT JOIN app.notes n ON a.note_id = n.note_id
WHERE n.note_id IS NULL;

-- Both should return 0
EOF
```

Expected: 0 rows in both ✅

- [ ] Check indexes exist

```bash
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'app' ORDER BY indexname;"
```

- [ ] Document actual schema

```bash
psql $DATABASE_URL -c "\d+ app.notes" > schema_notes_$(date +%Y%m%d).txt
psql $DATABASE_URL -c "\d+ app.login" > schema_login_$(date +%Y%m%d).txt
```

---

## Phase 3: Code Changes (Days 2-3 - ~3 hours)

### Create New Files

- [ ] Create: `src/lib/uuid-validation.js`

(Copy from `UUID_CODE_CHANGES.md`)

```bash
# Verify created
ls -la src/lib/uuid-validation.js
```

### Update Existing Files

- [ ] Edit: `src/app/api/notes/route.js`
  - [ ] Line 93: Add `::uuid` cast to user_id in INSERT
  - [ ] Line 55: Add `::uuid` cast to user_id in SELECT

```bash
# Quick check
grep -n "::uuid" src/app/api/notes/route.js
```

- [ ] Edit: `src/app/api/notes/[id]/route.js`
  - [ ] Line 36-43: Remove parseInt, add isValidUUID
  - [ ] Line 89-96: Remove parseInt, add isValidUUID  
  - [ ] Line 146-153: Remove parseInt, add isValidUUID
  - [ ] All WHERE clauses: Add `::uuid` casts

```bash
# Quick check - should be 0 or only in comments
rg "parseInt\(id" src/app/api/notes/
```

- [ ] Edit: `src/app/api/notes/[id]/meta/route.ts`
  - Apply same changes as above

```bash
rg "parseInt" src/app/api/notes/\[id\]/meta/
```

- [ ] Edit: `src/lib/notes/storage/pg-tree.js`
  - [ ] Add `::uuid` casts to user_id in all queries

```bash
# Check for non-cast user_id references
rg "user_id\s*=" src/lib/notes/storage/pg-tree.js
```

- [ ] Edit: `src/lib/notes/storage/pdf-annotations.js`
  - [ ] Add `::uuid` casts to user_id and note_id

```bash
rg "WHERE.*user_id|WHERE.*note_id" src/lib/notes/storage/pdf-annotations.js
```

### Create Tests

- [ ] Create: `src/__tests__/uuid-validation.test.js`

(Copy from `UUID_CODE_CHANGES.md`)

- [ ] Create: `src/__tests__/api/notes.integration.test.js`

(Copy from `UUID_CODE_CHANGES.md`)

```bash
# Verify created
ls -la src/__tests__/uuid-validation.test.js
ls -la src/__tests__/api/notes.integration.test.js
```

### Verify All Changes

```bash
# 1. No more parseInt(id) calls
rg "parseInt\(id\)" src/app/api

# Should return: 0 results
```

```bash
# 2. All user_id and note_id references have ::uuid casts
rg "WHERE.*user_id\s*=" src/app/api
rg "WHERE.*note_id\s*=" src/app/api

# Each should end with ::uuid
```

```bash
# 3. Type checking
npm run type-check

# Should pass with 0 errors
```

```bash
# 4. Linting
npm run lint

# Should pass with 0 errors
```

---

## Phase 4: Testing (Day 4 - ~2 hours)

### Unit Tests

```bash
npm test -- uuid-validation

# Expected: ✅ All tests pass
```

### Build & Start Dev Server

```bash
npm run build

# Expected: ✅ Build succeeds
```

```bash
npm run dev

# Expected: Server starts on localhost:3000
```

### Manual Integration Tests

Open another terminal and run:

#### Test 1: Create Note (POST)

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"UUID Test Note","content":"Testing UUIDv7 migration"}'

# Response should be:
# {
#   "note_id": "550e8400-e29b-41d4-a716-446655440000",
#   "user_id": "...",
#   "title": "UUID Test Note",
#   "content": "Testing UUIDv7 migration",
#   "created_at": "...",
#   "updated_at": "..."
# }

# Expected: ✅ 201 status, note_id is UUID format
```

- [ ] **Status:** Pass / Fail

#### Test 2: Get Note (GET)

```bash
NOTEID="550e8400-e29b-41d4-a716-446655440000"  # from Test 1

curl http://localhost:3000/api/notes/$NOTEID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: ✅ 200 status, returns note
```

- [ ] **Status:** Pass / Fail

#### Test 3: Update Note (PUT)

```bash
NOTEID="550e8400-e29b-41d4-a716-446655440000"

curl -X PUT http://localhost:3000/api/notes/$NOTEID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Note Title"}'

# Expected: ✅ 200 status, title is updated
```

- [ ] **Status:** Pass / Fail

#### Test 4: Delete Note (DELETE)

```bash
NOTEID="550e8400-e29b-41d4-a716-446655440000"

curl -X DELETE http://localhost:3000/api/notes/$NOTEID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: ✅ 200 status

# Verify deletion:
curl http://localhost:3000/api/notes/$NOTEID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: ❌ 404 (note not found)
```

- [ ] **Status:** Pass / Fail

#### Test 5: Invalid UUID

```bash
curl http://localhost:3000/api/notes/not-a-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: ❌ 400 status with error message
```

- [ ] **Status:** Pass / Fail

#### Test 6: Authentication & Tree Operations

```bash
# Verify tree operations still work with UUIDs
curl http://localhost:3000/api/tree \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: ✅ 200 status, returns tree structure
```

- [ ] **Status:** Pass / Fail

### Database Verification Tests

```bash
psql $DATABASE_URL << 'EOF'

-- Verify note_id is UUID with default
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'notes' 
  AND column_name = 'note_id';

-- Expected: note_id, uuid, gen_random_uuid()

-- Verify deleted_at added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'notes'
  AND column_name = 'deleted_at';

-- Expected: deleted_at, timestamp with time zone

-- Verify soft delete index exists
SELECT indexname FROM pg_indexes
WHERE schemaname = 'app' AND tablename = 'notes' AND indexname LIKE '%trash%';

-- Expected: idx_notes_trash

EOF
```

- [ ] **All database checks:** Pass / Fail

---

## Phase 5: Deployment (Day 5 - ~1 hour)

### Pre-Deployment

- [ ] All tests passing locally ✅
- [ ] Code reviewed ✅
- [ ] Database backup created ✅
- [ ] Staging tested ✅

### Deploy to Staging First

```bash
git add .
git commit -m "feat: migrate to UUIDv7 for note and user IDs

- Add UUID validation helper
- Remove parseInt ID parsing
- Add ::uuid SQL casts
- Add soft delete columns
- Update indexes for UUID queries
- Add comprehensive test suite"

git push origin uuid-migration

# Create PR, get review, merge to dev
```

```bash
# Deploy to staging
# (Your CI/CD process here)

# Run smoke tests on staging
npm run test:integration
```

### Deploy to Production

```bash
# 1. Backup production database
pg_dump $DATABASE_URL -Fc > backup_production_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply migration to production
psql $DATABASE_URL < database/migrations/003_uuid_v7_finalize.sql
psql $DATABASE_URL < database/migrations/004_schema_finalization.sql

# 3. Verify integrity (as in Phase 2)
psql $DATABASE_URL << 'EOF'
SELECT COUNT(*) FROM app.tree_items t
LEFT JOIN app.notes n ON t.note_id = n.note_id
WHERE t.note_id IS NOT NULL AND n.note_id IS NULL;
EOF

# 4. Deploy code
git push origin uuid-migration:main

# 5. Monitor logs
tail -f /var/log/app.log

# 6. Run production smoke test
curl -X GET https://api.oghmanotes.com/api/notes \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Post-Deployment

- [ ] All API endpoints responding ✅
- [ ] No errors in logs ✅
- [ ] Database metrics normal ✅
- [ ] Performance acceptable ✅

---

## Rollback Plan (If Issues)

If any critical issue occurs:

```bash
# 1. Stop application
systemctl stop oghmanotes

# 2. Restore database backup
pg_restore -d oghma backup_production_$(date +%Y%m%d).sql

# 3. Revert code
git revert <commit-hash>
git push origin main

# 4. Restart application
systemctl start oghmanotes
```

**Note:** Database migration is fully reversible (only added columns/indexes, no data deleted).

---

## Success Criteria

All of these must be true:

- ✅ All tests passing (unit + integration)
- ✅ No parseInt(id) calls remain in API code
- ✅ All UUID queries have ::uuid casts
- ✅ POST /api/notes returns UUID note_id
- ✅ GET /api/notes/{uuid} works
- ✅ PUT /api/notes/{uuid} works
- ✅ DELETE /api/notes/{uuid} works
- ✅ Tree operations work correctly
- ✅ PDF annotations work correctly
- ✅ No errors in production logs (24 hours)
- ✅ Performance metrics stable

---

## Quick Reference Commands

### View Current Schema
```bash
psql $DATABASE_URL -c "\d+ app.notes"
psql $DATABASE_URL -c "\d+ app.login"
psql $DATABASE_URL -c "\d+ app.tree_items"
```

### View Indexes
```bash
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'app' ORDER BY tablename, indexname;"
```

### Check for Old References
```bash
rg "parseInt\(id" src/
rg "parseInt\(.*id" src/
```

### Check UUID Casts
```bash
rg "::uuid" src/app/api
rg "::uuid" src/lib
```

### Run Tests
```bash
npm test                              # All tests
npm test -- uuid-validation           # UUID tests only
npm test -- notes.integration         # API integration tests
npm run type-check                    # TypeScript check
npm run lint                          # Linting
```

### Database Checks
```bash
# Check all UUIDs are valid
psql $DATABASE_URL << 'EOF'
SELECT note_id, length(CAST(note_id AS text)) as id_length
FROM app.notes LIMIT 5;
-- Should be 36 chars (including dashes)
EOF

# Check for duplicates (should be 0)
psql $DATABASE_URL -c "SELECT note_id, COUNT(*) FROM app.notes GROUP BY note_id HAVING COUNT(*) > 1;"

# Check foreign keys
psql $DATABASE_URL -c "\d app.tree_items" | grep FOREIGN
```

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| 1. Prepare | 2h | Mon 9am | Mon 11am |
| 2. Database Migration | 1h | Mon 11am | Mon 12pm |
| 3. Code Changes | 3h | Tue 9am | Tue 12pm |
| 4. Testing | 2h | Wed 9am | Wed 11am |
| 5. Deployment | 1h | Thu 5pm | Thu 6pm |

**Total: 9 hours over 5 days**

---

## Documents Reference

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `UUID_MIGRATION_STRATEGY.md` | Comprehensive strategy + rationale | 30 min |
| `UUID_CODE_CHANGES.md` | Exact code changes needed | 45 min |
| `UUID_SCHEMA_FINAL.md` | Schema design + SQL | 30 min |
| `UUID_MIGRATION_CHECKLIST.md` | This file - execution steps | 15 min |

---

## Questions?

Refer to the detailed documents:
- **"Why are we doing this?"** → `UUID_MIGRATION_STRATEGY.md`
- **"What exactly do I change?"** → `UUID_CODE_CHANGES.md`
- **"What does the schema look like?"** → `UUID_SCHEMA_FINAL.md`
- **"How do I execute this?"** → This checklist

Good luck! 🚀
