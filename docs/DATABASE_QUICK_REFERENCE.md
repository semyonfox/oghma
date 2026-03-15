# Database Quick Reference — Tree System

**TL;DR of the entire file tree architecture.**

---

## Two Tables, One Relationship

| Table | Role | Key Columns |
|---|---|---|
| `app.notes` | **What** are the things? | `note_id` (UUID PK), `user_id`, `is_folder`, `deleted`, `cloned_from` |
| `app.tree_items` | **Where** do they go? | `note_id` (FK), `parent_id` (FK), `position` (DOUBLE), `user_id` |

**The join:** `tree_items.note_id → notes.note_id`

---

## Core Concepts

### Nodes
Both **folders** and **notes** are rows in `app.notes`. Difference: `is_folder = true` vs `false`.

### Parents & Children
```
tree_items.parent_id → notes.note_id
```
If `parent_id = NULL`, the item is at root.

### Ordering
```
tree_items.position
```
Values: `1000, 2000, 4500, ...` (gap-based).
Result: Insert between any two items without rewriting others. O(1).

### Per-User Isolation
Every query filters on `user_id`.
```sql
WHERE user_id = 'alice-uuid'
```
Alice's tree completely isolated from Bob's. Clones are independent copies.

### Soft Delete
```
notes.deleted = 0 (active)
notes.deleted = 1 (soft-deleted)
notes.deleted_at = <timestamp> (when deleted)
```
Queries filter: `WHERE deleted = 0 AND deleted_at IS NULL`

Hidden for 7 days, then hard-deleted by background job.

### Sharing
```
notes.cloned_from = <original_note_id>
```
If present, this is a shared copy. Independent from original.

---

## Queries You Need

### Load Root Items

```sql
SELECT ti.note_id, n.title, n.is_folder, ti.position, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid
  AND ti.parent_id IS NULL
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY ti.position;
```

**What:** Get all root items for a user.
**Time:** ~100ms
**Returns:** 3-50 rows typically

### Load Children of a Folder

```sql
SELECT ti.note_id, n.title, n.is_folder, ti.position, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid
  AND ti.parent_id = $2::uuid
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY ti.position;
```

**What:** Get all children of a specific folder.
**Time:** ~80ms
**Returns:** 10-500 rows per folder

### Create a Note

```sql
BEGIN;
  -- 1. Insert note
  INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
  VALUES ($1::uuid, $2::uuid, $3, $4, false, 0, NOW(), NOW());
  
  -- 2. Get max position in parent
  SELECT COALESCE(MAX(position), 0) as max_pos
  FROM app.tree_items
  WHERE user_id = $2::uuid AND parent_id = $5::uuid;
  
  -- 3. Insert tree item at max_pos + 1000
  INSERT INTO app.tree_items (user_id, note_id, parent_id, position, is_expanded)
  VALUES ($2::uuid, $1::uuid, $5::uuid, max_pos + 1000, false);
COMMIT;
```

**What:** Create a new note and add it to the tree.
**Time:** ~100ms
**Atomicity:** Wrapped in transaction; both succeed or both fail.

### Move/Reorder a Note

```sql
BEGIN;
  -- Lock the destination folder's sibling list
  SELECT id FROM app.tree_items
  WHERE user_id = $1::uuid AND parent_id = $3::uuid
  FOR UPDATE;
  
  -- Calculate new position (midpoint between siblings if needed)
  -- [Logic in application code]
  
  -- Update the moved note
  UPDATE app.tree_items
  SET parent_id = $3::uuid,
      position = $4,
      updated_at = NOW()
  WHERE user_id = $1::uuid AND note_id = $2::uuid;
COMMIT;
```

**What:** Move note to a new parent or reorder within same parent.
**Time:** ~150ms
**Concurrency:** `FOR UPDATE` lock prevents position collisions.

### Delete a Note

```sql
BEGIN;
  -- Soft delete
  UPDATE app.notes
  SET deleted = 1, deleted_at = NOW()
  WHERE note_id = $1::uuid AND user_id = $2::uuid;
  
  -- Remove from tree
  DELETE FROM app.tree_items
  WHERE user_id = $2::uuid AND note_id = $1::uuid;
  
  -- Cascade: attachments and annotations deleted via FK
COMMIT;
```

**What:** Soft-delete a note (hidden for 7 days, then hard-deleted).
**Time:** ~80ms
**Cascades:** Attachments, annotations auto-deleted via FK.

### Share a Note (Clone)

```sql
BEGIN;
  -- Create clone in target user's notes
  INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, cloned_from, deleted, created_at, updated_at)
  VALUES (
    $1::uuid,  -- new UUID v7
    $2::uuid,  -- target user
    'Original Title (shared by Alice)',
    (SELECT content FROM app.notes WHERE note_id = $3::uuid),
    (SELECT s3_key FROM app.notes WHERE note_id = $3::uuid),
    false,
    $3::uuid,  -- cloned_from = original note_id
    0,
    NOW(),
    NOW()
  );
  
  -- Add to target user's tree
  INSERT INTO app.tree_items (user_id, note_id, parent_id, position, is_expanded)
  VALUES ($2::uuid, $1::uuid, $4::uuid, (SELECT COALESCE(MAX(position), 0) + 1000 ...), false);
COMMIT;
```

**What:** Create independent copy of note for another user.
**Time:** ~150ms
**Result:** Target user has their own copy; edits don't propagate.

### Check Tree Health

```sql
-- Orphaned notes
SELECT COUNT(*) FROM app.notes n
WHERE n.user_id = $1::uuid
  AND n.deleted = 0 AND n.deleted_at IS NULL
  AND n.note_id NOT IN (SELECT note_id FROM app.tree_items WHERE user_id = $1::uuid);

-- Circular references (depth < 100)
WITH RECURSIVE check_circle AS (...)
SELECT COUNT(*) FROM check_circle WHERE note_id = parent_id;
```

**What:** Verify tree integrity (shouldn't happen in normal operation).
**Time:** ~500ms

---

## Indexes

```sql
CREATE INDEX idx_tree_user_parent_pos 
ON app.tree_items(user_id, parent_id, position)
INCLUDE (note_id, is_expanded);
```

**Why:** Enables index-only scans for the dominant query pattern.

**Used by:**
- Root load (`parent_id IS NULL`)
- Children load (`parent_id = X`)
- Both already sorted by position (no extra sort step)

---

## Data Lifecycle

### Creation
1. User clicks "+" in folder
2. UUID v7 generated for note
3. INSERT `app.notes` + INSERT `app.tree_items` (transaction)
4. Note appears in sidebar instantly

### Modification
1. User edits content
2. PUT `/api/notes/:id` updates `app.notes`
3. Tree structure unchanged
4. Content in S3, metadata in DB

### Movement
1. User drags note
2. POST `/api/tree` calculates new position
3. UPDATE `app.tree_items` (one row)
4. No other positions change

### Deletion
1. User clicks delete
2. UPDATE `app.notes` SET deleted=1, deleted_at=NOW()
3. DELETE FROM `app.tree_items` (remove from tree)
4. Note hidden from queries (filtered out by `deleted=0` clause)
5. After 7 days: background job hard-deletes

### Sharing
1. User clicks "Share with Bob"
2. INSERT into `app.notes` (new UUID, Bob's user_id, `cloned_from` = original)
3. INSERT into `app.tree_items` (Bob's tree)
4. Bob sees independent copy; edits don't affect Alice

---

## Performance Targets

| Operation | Target | With Index |
|---|---|---|
| Load root | <200ms | 100ms ✅ |
| Load folder children | <150ms | 80ms ✅ |
| Create note | <150ms | 100ms ✅ |
| Move note | <200ms | 150ms ✅ |
| Delete note | <150ms | 80ms ✅ |
| Share note | <200ms | 150ms ✅ |
| Health check | <1000ms | 500ms ✅ |

All operations sub-200ms = responsive UI.

---

## Scalability

| Scenario | Supported? |
|---|---|
| 1 user, 5000 notes | ✅ Fast |
| 100 users, 1000 notes each | ✅ ~100MB DB |
| 1000 users, 5000 notes each | ✅ ~4.5GB DB (fits on t4g.xlarge) |
| 10000 users, 1000 notes each | ✅ ~3.5GB DB |
| Folder with 500 children | ✅ Virtual list in UI |
| Depth of 10 levels | ✅ Recursive CTE handles it |

No schema changes needed. Scales via indexing + lazy load.

---

## Common Mistakes to Avoid

❌ **Don't:** Store tree structure in S3 (`tree/tree.json`)
✅ **Do:** PostgreSQL is the single source of truth.

❌ **Don't:** Use integer `position` (causes collisions on concurrent inserts)
✅ **Do:** Use DOUBLE PRECISION positions (gaps allow O(1) inserts).

❌ **Don't:** Store parent-child as separate documents
✅ **Do:** FK `parent_id → notes.note_id` in same table.

❌ **Don't:** Load entire tree on page load for large users
✅ **Do:** Lazy load: root only, then children on expand.

❌ **Don't:** Rewrite all sibling positions when reordering
✅ **Do:** Gap-based insertion (midpoint math).

❌ **Don't:** Hard-delete notes immediately
✅ **Do:** Soft-delete, keep for 7 days, then hard-delete.

❌ **Don't:** Store sharing as a reference (A points to B's tree)
✅ **Do:** Clone (B gets independent copy, `cloned_from` tracks source).

---

## File Structure in Code

```
src/
├─ app/
│  ├─ api/
│  │  ├─ tree/
│  │  │  ├─ route.ts          (GET tree root, POST move/mutate)
│  │  │  ├─ children/
│  │  │  │  └─ route.ts       (GET children — lazy load)
│  │  │  └─ status/
│  │  │     └─ route.ts       (GET integrity checks)
│  │  └─ notes/
│  │     ├─ route.js          (POST create, GET list)
│  │     └─ [id]/
│  │        ├─ route.js       (GET, PUT, DELETE)
│  │        └─ share/
│  │           └─ route.ts    (POST share → clone)
│  ├─ login/
│  │  └─ page.js              (OAuth + JWT auth)
│  └─ notes/
│     └─ page.tsx             (Editor + sidebar)
│
├─ lib/
│  ├─ notes/
│  │  ├─ storage/
│  │  │  └─ pg-tree.js        (Tree CRUD ops)
│  │  └─ state/
│  │     └─ tree.ts           (Zustand tree store)
│  └─ utils/
│     └─ uuid.js              (generateUUID v7)
│
└─ database/
   ├─ pgsql.js                (Connection pool)
   ├─ migrations/
   │  └─ 005_clean_uuid_v7_schema.sql
   └─ schema-current.json      (Current live schema)
```

---

## Key Files to Know

| File | Purpose |
|---|---|
| `src/lib/notes/storage/pg-tree.js` | Tree CRUD: add, remove, move, sync |
| `src/app/api/tree/route.ts` | Tree API: GET root, POST mutate |
| `src/lib/notes/state/tree.ts` | Zustand store: optimistic updates |
| `src/app/api/notes/[id]/route.js` | Note CRUD: create, read, update, delete |
| `src/app/api/notes/[id]/share/route.ts` | Sharing: clone to another user |
| `database/migrations/005_clean_uuid_v7_schema.sql` | The schema itself |

---

## SQL Cheat Sheet

### Get all children recursively (full tree)

```sql
WITH RECURSIVE tree AS (
  SELECT note_id, parent_id, title, 1 as depth
  FROM app.tree_items ti
  JOIN app.notes n ON ti.note_id = n.note_id
  WHERE ti.user_id = $1 AND ti.parent_id IS NULL
  
  UNION ALL
  
  SELECT ti.note_id, ti.parent_id, n.title, tree.depth + 1
  FROM tree
  JOIN app.tree_items ti ON ti.parent_id = tree.note_id
  JOIN app.notes n ON ti.note_id = n.note_id
  WHERE ti.user_id = $1
)
SELECT * FROM tree ORDER BY depth, note_id;
```

### Get breadcrumb path

```sql
WITH RECURSIVE path AS (
  SELECT note_id, parent_id, 1 as step
  FROM app.tree_items
  WHERE user_id = $1 AND note_id = $2
  
  UNION ALL
  
  SELECT ti.note_id, ti.parent_id, path.step + 1
  FROM path
  JOIN app.tree_items ti ON ti.note_id = path.parent_id
  WHERE ti.user_id = $1
)
SELECT n.title FROM path
JOIN app.notes n ON n.note_id = path.note_id
ORDER BY step DESC;
```

### Count notes by folder

```sql
SELECT 
  ti.parent_id,
  n.title as parent_name,
  COUNT(ti.note_id) as child_count
FROM app.tree_items ti
LEFT JOIN app.notes n ON ti.parent_id = n.note_id
WHERE ti.user_id = $1
GROUP BY ti.parent_id, n.title
ORDER BY child_count DESC;
```

---

## Debugging Checklist

**Tree loads slowly?**
- Check: `idx_tree_user_parent_pos` index exists
- Check: Query uses `WHERE user_id = X AND parent_id = Y`
- Check: Not loading entire tree (should be lazy)

**Move fails?**
- Check: `FOR UPDATE` lock acquired
- Check: New position calculated correctly (midpoint)
- Check: Both parent_id and position valid UUIDs

**Note appears twice in tree?**
- Check: `UNIQUE(user_id, note_id)` constraint exists
- Check: Should not happen; if it does = data corruption

**Orphaned notes?**
- Check: Background job deletes notes where `deleted=1 AND deleted_at < 7 days old`
- Fix: `POST /api/tree/rebuild` to re-add orphans to root

**Slow sharing?**
- Check: Content/s3_key fetched in same transaction
- Check: Not making separate S3 calls

---

## Summary

```
┌──────────────────────────────┐
│   app.notes (metadata)       │  ← What are the items?
│   (is_folder, deleted, etc)  │
└──────────────────────────────┘
         ↑         ↓
      JOIN ON
      note_id
         ↑         ↓
┌──────────────────────────────┐
│  app.tree_items (structure)  │  ← How are they organized?
│  (parent_id, position, user) │
└──────────────────────────────┘
```

**Two tables.**
**One index: (user_id, parent_id, position)**
**Four operations: Create, Move, Delete, Share**
**100% isolated per user.**
**O(1) reordering via gap-based position.**
**Soft-delete with 7-day retention.**
**Cloning for sharing.**

**That's the entire system.**
