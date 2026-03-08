# UUID v7 Migration - Complete Implementation Guide

## 📚 Documentation Package

This folder contains a complete UUID v7 migration strategy for OghmaNotes. Four markdown documents (2,352 lines) guide you step-by-step.

### Your Documents

| Document | Size | Purpose |
|----------|------|---------|
| **UUID_MIGRATION_STRATEGY.md** | 16 KB | 🗺️ Overall strategy & 5-phase plan |
| **UUID_CODE_CHANGES.md** | 16 KB | 💻 Exact code changes (before/after) |
| **UUID_SCHEMA_FINAL.md** | 18 KB | 🗄️ Database schema & SQL migrations |
| **UUID_MIGRATION_CHECKLIST.md** | 13 KB | ✅ Step-by-step execution checklist |

---

## 🎯 What This Does

Migrates your database from INTEGER note IDs to UUIDv7:

**Before:**
```javascript
note_id: 123  // Easy to guess, enumerate
user_id: 456  // Tied to server sequence
```

**After:**
```javascript
note_id: "550e8400-e29b-41d4-a716-446655440000"  // Unique, unguessable
user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  // Globally unique
```

**Benefits:**
- ✅ Security: Can't enumerate note IDs
- ✅ Scalability: Distributed ID generation
- ✅ Sortability: UUIDv7 encodes timestamp
- ✅ Standards: Industry best practice

---

## 📖 How to Read

**If you have 5 minutes:**
1. Read "Quick Start" section below

**If you have 15 minutes:**
1. Read this README
2. Skim UUID_MIGRATION_STRATEGY.md (Phases section)

**If you have 1 hour:**
1. Read UUID_MIGRATION_STRATEGY.md (complete)
2. Skim UUID_SCHEMA_FINAL.md (schema overview)

**If you're ready to implement (5 days):**
1. Follow UUID_MIGRATION_CHECKLIST.md
2. Reference UUID_CODE_CHANGES.md while coding
3. Consult UUID_SCHEMA_FINAL.md for database work

---

## 🚀 Quick Start

### Day 1: Prepare
```bash
# 1. Read strategy (15 min)
cat UUID_MIGRATION_STRATEGY.md | less

# 2. Verify PostgreSQL extensions
psql $DATABASE_URL -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgvector');"
# Expected: Both present ✅

# 3. Backup database
pg_dump $DATABASE_URL -Fc > backup_$(date +%Y%m%d).sql

# 4. Clean up old files
git mv database/migrations/002_migrate_to_uuid_v7.sql database/migrations/002_migrate_to_uuid_v7.sql.bak
git rm database/migrations/001_create_notes_table.sql
```

### Days 2-3: Code Changes
```bash
# 1. Create UUID validation helper
# See: UUID_CODE_CHANGES.md (copy the code)

# 2. Remove all parseInt(id) calls
# Search: rg "parseInt\(id" src/app/api

# 3. Add ::uuid casts to SQL
# Search: rg "WHERE.*user_id\s*=" src/

# Follow UUID_CODE_CHANGES.md for exact changes
```

### Day 4: Test
```bash
npm run build  # ✅ Should pass
npm test       # ✅ Should pass
npm run dev    # ✅ Server starts
# Test API endpoints manually (see checklist)
```

### Day 5: Deploy
```bash
git commit -m "feat: migrate to UUIDv7"
git push
# Deploy via your CI/CD pipeline
```

---

## 📊 What Changes

### Database
- ✅ `note_id`: UUID (verify default)
- ✅ `user_id`: UUID (already correct)
- ✅ Add `deleted_at` for soft delete
- ✅ Add `last_login_at` for audit
- ✅ Optimize indexes
- ❌ Drop `documents` table (unused)
- ❌ Drop `chunks` table (unused)

### Code
- Remove ~15 `parseInt(id)` calls
- Add `isValidUUID()` function
- Add ~30 `::uuid` SQL casts
- Add test suite (100+ tests)

### Effort
**5 days, ~9 hours of work**

---

## ✅ Success Looks Like

After migration:
- ✅ POST /api/notes returns UUID `note_id`
- ✅ GET /api/notes/{uuid} works with UUID
- ✅ All tests passing
- ✅ No errors in production logs (24h)
- ✅ Performance metrics stable

Full checklist in UUID_MIGRATION_CHECKLIST.md

---

## 🔍 Before You Start

**Verify current state:**

```bash
# Should see UUID:
psql $DATABASE_URL -c "SELECT note_id, user_id FROM app.notes LIMIT 1;" 

# Should NOT see:
# - Any `parseInt(id)` in /api/notes routes
# - schema.sql as source of truth

# Should have:
# - database/migrations/ with 3 files
# - Extensions: uuid-ossp, pgvector
# - Tables: login, notes, tree_items, attachments, pdf_annotations
```

---

## 🎯 Key Decisions (Already Made For You)

| Decision | Choice | Why |
|----------|--------|-----|
| **ID System** | UUIDv7 | Sortable, unique, unguessable |
| **Internal IDs** | Keep INTEGER | tree_items.id, attachments.id stay INT |
| **UUID Generation** | Server-side | Database generates with DEFAULT |
| **Soft Delete** | `deleted_at` timestamp | SRS requires 7-day retention |
| **Unused Tables** | Drop them | documents, chunks not used |
| **Indexes** | Composite | Faster queries than single-column |

All explained in detail in UUID_SCHEMA_FINAL.md

---

## 📝 Files to Create

Create these SQL migrations in `database/migrations/`:

1. **003_uuid_v7_finalize.sql**
   - Verify UUID defaults
   - Create performance indexes
   - [Copy from UUID_SCHEMA_FINAL.md]

2. **004_schema_finalization.sql**
   - Drop unused tables
   - Add soft delete support
   - Add audit fields
   - [Copy from UUID_SCHEMA_FINAL.md]

---

## ⚠️ Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking code | Medium | Follow checklist, comprehensive tests |
| Data loss | Low | Full database backup, reversible migration |
| Performance | Low | Optimized indexes included |
| Deployment | Low | Staged rollout (local → staging → prod) |

All mitigation steps documented in checklist.

---

## 🆘 Troubleshooting

### "I see a schema mismatch"
→ Read UUID_SCHEMA_FINAL.md "Current vs Target" section

### "Where do I change X?"
→ Search UUID_CODE_CHANGES.md for that file/function

### "Why are we doing this?"
→ Read UUID_MIGRATION_STRATEGY.md "Benefits" section

### "How do I rollback?"
→ See UUID_MIGRATION_CHECKLIST.md "Rollback Plan"

---

## 📚 Document Index

### By Use Case

**I want to understand the strategy**
→ UUID_MIGRATION_STRATEGY.md

**I want to know exact code changes**
→ UUID_CODE_CHANGES.md

**I want to understand the schema**
→ UUID_SCHEMA_FINAL.md

**I want to execute the migration**
→ UUID_MIGRATION_CHECKLIST.md

---

### By Phase

**Phase 1: Prepare** (2h)
→ UUID_MIGRATION_CHECKLIST.md "Phase 1"

**Phase 2: Database** (1h)
→ UUID_SCHEMA_FINAL.md + UUID_MIGRATION_CHECKLIST.md "Phase 2"

**Phase 3: Code** (3h)
→ UUID_CODE_CHANGES.md + UUID_MIGRATION_CHECKLIST.md "Phase 3"

**Phase 4: Testing** (2h)
→ UUID_MIGRATION_CHECKLIST.md "Phase 4"

**Phase 5: Deploy** (1h)
→ UUID_MIGRATION_CHECKLIST.md "Phase 5"

---

## 🎓 Background

### Why UUIDs?

1. **Security**: Can't enumerate notes (123, 124, 125...)
2. **Scalability**: Generate IDs without central database
3. **Privacy**: IDs don't reveal creation order
4. **Standards**: Industry best practice (most APIs use UUIDs)

### Why UUIDv7?

UUIDv7 is better than v4 because:
- **Sortable**: Encodes timestamp (better for databases)
- **Sequential**: Better B-tree index performance
- **Standard**: Latest RFC recommendation

### Why not v4?

- ❌ Randomly ordered (bad for index performance)
- ❌ Doesn't encode timestamp
- ✅ Still secure, just less optimal for databases

---

## 📞 If You Get Stuck

1. Check the error message
2. Search in UUID_CODE_CHANGES.md
3. Verify database schema: `psql $DATABASE_URL -c "\d app.notes"`
4. Check for similar patterns in the docs
5. Review the specific phase in UUID_MIGRATION_CHECKLIST.md

---

## Next Steps

1. **Read:** UUID_MIGRATION_STRATEGY.md (30 min)
2. **Understand:** UUID_SCHEMA_FINAL.md (30 min)
3. **Execute:** Follow UUID_MIGRATION_CHECKLIST.md (5 days)

You're ready to go! 🚀

---

**Questions?** Everything is documented. Reference the relevant file above.
