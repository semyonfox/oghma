# Database Visual Guide — Tree Structure Diagram

This document shows visual representations of the tree structure.

---

## The Two Tables

```
┌─────────────────────────────────────────────────┐
│                 app.notes                       │
├─────────────────────────────────────────────────┤
│ note_id (UUID) [PK]                             │
│ user_id (UUID) [FK→login]                       │
│ title (TEXT)                                    │
│ is_folder (BOOL) ← KEY: folder vs leaf note     │
│ deleted, deleted_at                             │
│ cloned_from (UUID) ← if this is a shared copy   │
│ content, s3_key, embedding, pinned, shared...   │
└─────────────────────────────────────────────────┘
         ↑
         │ JOIN ON tree_items.note_id
         │
┌─────────────────────────────────────────────────┐
│              app.tree_items                     │
├─────────────────────────────────────────────────┤
│ id (UUID) [PK]                                  │
│ user_id (UUID) [FK→login]                       │
│ note_id (UUID) [FK→notes]                       │
│ parent_id (UUID) [FK→notes] ← NULL = root       │
│ position (DOUBLE) ← gap-based: 1000,2000...     │
│ is_expanded (BOOL)                              │
│ UNIQUE(user_id, note_id)                        │
└─────────────────────────────────────────────────┘
```

---

## Example Tree Structure

### Visual (what user sees)

```
User: alice-uuid

📁 My Projects (pos=1000)
├─ 📋 Project A Design (pos=1000)
└─ 📋 Project B Planning (pos=2000)

📁 University Notes (pos=2000)
├─ 📁 CT213 (pos=1000)
│  ├─ 📋 Lecture 1 (pos=1000)
│  └─ 📋 Lecture 2 (pos=2000)
└─ 📋 General Notes (pos=2000)

📋 Personal TODO (pos=3000)
```

### Data in `app.notes` (8 rows)

```
note_id                              title                is_folder  user_id
─────────────────────────────────────────────────────────────────────────────
1111-1111-1111-1111-1111-1111        My Projects          true       alice
2222-2222-2222-2222-2222-2222        Project A Design     false      alice
3333-3333-3333-3333-3333-3333        Project B Planning   false      alice
4444-4444-4444-4444-4444-4444        University Notes     true       alice
5555-5555-5555-5555-5555-5555        CT213                true       alice
6666-6666-6666-6666-6666-6666        Lecture 1            false      alice
7777-7777-7777-7777-7777-7777        Lecture 2            false      alice
8888-8888-8888-8888-8888-8888        General Notes        false      alice
9999-9999-9999-9999-9999-9999        Personal TODO        false      alice
```

### Data in `app.tree_items` (9 rows for alice)

```
id                           user_id  note_id           parent_id          position  is_expanded
──────────────────────────────────────────────────────────────────────────────────────────────────
ti-1                         alice    1111-1111-...     NULL               1000      true
ti-2                         alice    2222-2222-...     1111-1111-...      1000      false
ti-3                         alice    3333-3333-...     1111-1111-...      2000      false
ti-4                         alice    4444-4444-...     NULL               2000      true
ti-5                         alice    5555-5555-...     4444-4444-...      1000      true
ti-6                         alice    6666-6666-...     5555-5555-...      1000      false
ti-7                         alice    7777-7777-...     5555-5555-...      2000      false
ti-8                         alice    8888-8888-...     4444-4444-...      2000      false
ti-9                         alice    9999-9999-...     NULL               3000      false
```

---

## SQL Query Workflow

### 1. Load Root (Initial Page Load)

**SQL:**
```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position,
  ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'
  AND ti.parent_id IS NULL
ORDER BY ti.position;
```

**Trace:**
```
app.tree_items rows where parent_id = NULL:
  └─ ti-1 (note_id=1111..., pos=1000)
  └─ ti-4 (note_id=4444..., pos=2000)
  └─ ti-9 (note_id=9999..., pos=3000)

JOIN to app.notes:
  1111... → "My Projects", is_folder=true
  4444... → "University Notes", is_folder=true
  9999... → "Personal TODO", is_folder=false

Result (3 rows):
  ┌──────────────────────────────────────────────────┐
  │ note_id         title                 is_folder  │
  ├──────────────────────────────────────────────────┤
  │ 1111-1111-...   My Projects           true       │
  │ 4444-4444-...   University Notes      true       │
  │ 9999-9999-...   Personal TODO         false      │
  └──────────────────────────────────────────────────┘

Frontend renders:
  📁 My Projects
  📁 University Notes
  📋 Personal TODO
```

---

### 2. User Expands "University Notes"

**Action:** Click disclosure triangle

**SQL:**
```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position,
  ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'
  AND ti.parent_id = '4444-4444-...'  -- University Notes UUID
ORDER BY ti.position;
```

**Trace:**
```
app.tree_items rows where parent_id = 4444...:
  └─ ti-5 (note_id=5555..., pos=1000)
  └─ ti-8 (note_id=8888..., pos=2000)

JOIN to app.notes:
  5555... → "CT213", is_folder=true
  8888... → "General Notes", is_folder=false

Result (2 rows):
  ┌──────────────────────────────────────────────────┐
  │ note_id         title           is_folder        │
  ├──────────────────────────────────────────────────┤
  │ 5555-5555-...   CT213           true             │
  │ 8888-8888-...   General Notes   false            │
  └──────────────────────────────────────────────────┘

Frontend renders:
  ▼ 📁 University Notes  ← now expanded
    ├─ 📁 CT213
    └─ 📋 General Notes
```

---

### 3. User Expands "CT213" (nested)

**SQL:**
```sql
WHERE ti.user_id = 'alice-uuid'
  AND ti.parent_id = '5555-5555-...'  -- CT213 UUID
```

**Trace:**
```
app.tree_items rows where parent_id = 5555...:
  └─ ti-6 (note_id=6666..., pos=1000)
  └─ ti-7 (note_id=7777..., pos=2000)

JOIN to app.notes:
  6666... → "Lecture 1", is_folder=false
  7777... → "Lecture 2", is_folder=false

Result:
  ┌──────────────────────────────────────────────────┐
  │ note_id         title           is_folder        │
  ├──────────────────────────────────────────────────┤
  │ 6666-6666-...   Lecture 1       false            │
  │ 7777-7777-...   Lecture 2       false            │
  └──────────────────────────────────────────────────┘

Frontend renders:
  ▼ 📁 University Notes
    ▼ 📁 CT213
      ├─ 📋 Lecture 1
      └─ 📋 Lecture 2
    └─ 📋 General Notes
```

---

## Move Operation Walkthrough

### Before Move

```
app.tree_items for alice:

ti-5: note_id=5555, parent_id=4444, position=1000  (CT213 → University)
ti-6: note_id=6666, parent_id=5555, position=1000  (L1 → CT213)
ti-7: note_id=7777, parent_id=5555, position=2000  (L2 → CT213)
ti-9: note_id=9999, parent_id=NULL, position=3000  (TODO → root)

Sidebar:
  ▼ University Notes
    ▼ CT213
      ├─ Lecture 1  ← dragging this
      └─ Lecture 2
    └─ General Notes
  📋 Personal TODO
```

### Move: "Lecture 1" → "Personal TODO"

**User drags** Lecture 1 → Personal TODO (which becomes a folder)

**API Request:**
```json
POST /api/tree
{
  "action": "move",
  "data": {
    "source": { "parentId": "5555-...", "index": 0 },
    "destination": { "parentId": "9999-...", "index": 0 }
  }
}
```

**Server:**

1. Lock destination folder:
```sql
SELECT id FROM app.tree_items
WHERE user_id = 'alice-uuid' AND parent_id = '9999-...'
FOR UPDATE;
-- (blocks other moves into this folder)
```

2. Find position for new item in TODO:
```sql
SELECT COALESCE(MAX(position), 0) as max_pos
FROM app.tree_items
WHERE user_id = 'alice-uuid' AND parent_id = '9999-...';
```
Result: `0` (no children yet)

3. Calculate: `new_position = 1000`

4. Update the moved item:
```sql
UPDATE app.tree_items
SET parent_id = '9999-...',
    position = 1000,
    updated_at = NOW()
WHERE user_id = 'alice-uuid' AND note_id = '6666-...';
```

**After Move:**

```
app.tree_items for alice (CHANGED ROWS):

ti-5: note_id=5555, parent_id=4444, position=1000  (CT213 → University) ✓ unchanged
ti-6: note_id=6666, parent_id=9999, position=1000  ← CHANGED (was parent=5555, pos=1000)
ti-7: note_id=7777, parent_id=5555, position=2000  ✓ unchanged
ti-9: note_id=9999, parent_id=NULL, position=3000  ✓ unchanged

Sidebar:
  ▼ University Notes
    ▼ CT213
      └─ Lecture 2  ← Lecture 1 gone!
    └─ General Notes
  ▼ 📋 Personal TODO  ← now a folder
    └─ Lecture 1  ← MOVED HERE
```

**Key insight:** Only 1 row changed. No cascading updates. Other positions untouched. ✅

---

## Position Spacing (Gap-Based)

### Initial State

Three items at positions:
```
Position: 1000   2000   3000
Item:     A      B      C
Gap:      ↑1000↓ ↑1000↓ ↑1000↓
```

### Insert Between A and B

Positions of A (1000) and B (2000):
```
New position = (1000 + 2000) / 2 = 1500
```

Result:
```
Position: 1000   1500   2000   3000
Item:     A      NEW    B      C
Gap:      ↑500↓  ↑500↓  ↑1000↓
```

### Insert Between A and NEW

Positions of A (1000) and NEW (1500):
```
New position = (1000 + 1500) / 2 = 1250
```

Result:
```
Position: 1000   1250   1500   2000   3000
Item:     A      NEW2   NEW    B      C
```

**Can repeat indefinitely.** No rewriting of other items. **O(1) insertion.** ✅

---

## Soft Delete Example

### Before Delete

```
app.notes for alice:

6666-...: title="Lecture 1", deleted=0, deleted_at=NULL
7777-...: title="Lecture 2", deleted=0, deleted_at=NULL

app.tree_items for alice:

ti-6: note_id=6666, parent_id=5555, position=1000
ti-7: note_id=7777, parent_id=5555, position=2000

Sidebar shows:
  ▼ CT213
    ├─ Lecture 1
    └─ Lecture 2
```

### User Deletes "Lecture 1"

```sql
-- Soft delete
UPDATE app.notes
SET deleted = 1,
    deleted_at = '2025-03-15 10:45:23'
WHERE note_id = '6666-...' AND user_id = 'alice-uuid';

-- Remove from tree
DELETE FROM app.tree_items
WHERE user_id = 'alice-uuid' AND note_id = '6666-...';
```

### After Delete

```
app.notes for alice:

6666-...: title="Lecture 1", deleted=1, deleted_at=2025-03-15 10:45:23  ← marked deleted
7777-...: title="Lecture 2", deleted=0, deleted_at=NULL

app.tree_items for alice:

ti-7: note_id=7777, parent_id=5555, position=2000  ← ti-6 deleted

Sidebar query filters:
  WHERE deleted = 0 AND deleted_at IS NULL
  
Result shows:
  ▼ CT213
    └─ Lecture 2  ← Lecture 1 hidden!
```

### After 7 Days (Background Job)

```sql
DELETE FROM app.notes
WHERE deleted = 1 AND deleted_at < NOW() - INTERVAL '7 days';
```

```
app.notes for alice:

6666-...: GONE (hard deleted)
7777-...: title="Lecture 2", deleted=0, deleted_at=NULL

Sidebar still shows:
  ▼ CT213
    └─ Lecture 2
```

---

## Clone/Sharing Example

### Before Share

Alice has:
```
app.notes (alice):
  9999-...: title="Personal TODO", user_id=alice-uuid, cloned_from=NULL

app.tree_items (alice):
  ti-9: note_id=9999, parent_id=NULL, position=3000
```

Bob has:
```
(nothing shared yet)
```

### Alice Shares with Bob

```sql
-- Create clone in Bob's notes
INSERT INTO app.notes (
  note_id, user_id, title, content, s3_key, is_folder,
  cloned_from, deleted, created_at, updated_at
) VALUES (
  'bbbb-...',  -- NEW UUID v7
  'bob-uuid',
  'Personal TODO (shared by Alice)',
  (SELECT content FROM app.notes WHERE note_id='9999-...'),
  (SELECT s3_key FROM app.notes WHERE note_id='9999-...'),
  false,
  '9999-...',  -- cloned_from points to Alice's original
  0,
  NOW(),
  NOW()
);

-- Add to Bob's tree at root
INSERT INTO app.tree_items (
  user_id, note_id, parent_id, position, is_expanded
) VALUES (
  'bob-uuid',
  'bbbb-...',
  NULL,  -- at Bob's root
  4000,
  false
);
```

### After Share

Alice has (unchanged):
```
app.notes (alice):
  9999-...: title="Personal TODO", cloned_from=NULL, user_id=alice-uuid

app.tree_items (alice):
  ti-9: note_id=9999, parent_id=NULL, position=3000
```

Bob now has (new):
```
app.notes (bob):
  bbbb-...: title="Personal TODO (shared by Alice)", cloned_from=9999-..., user_id=bob-uuid

app.tree_items (bob):
  ti-10: note_id=bbbb-..., parent_id=NULL, position=4000
```

**Alice's sidebar:** Unchanged
```
📋 Personal TODO
```

**Bob's sidebar:** Has clone
```
📋 Personal TODO (shared by Alice)  ← NEW
```

**Key points:**
- Different `note_id` (9999 vs bbbb)
- Different `user_id` (alice vs bob)
- `cloned_from` tracks the source
- Bob's edits don't affect Alice
- Alice's edits don't affect Bob
- Fully independent copies ✓

---

## Index Strategy

### Main Index: `idx_tree_user_parent_pos`

```sql
CREATE INDEX idx_tree_user_parent_pos 
ON app.tree_items(user_id, parent_id, position)
INCLUDE (note_id, is_expanded);
```

**Used by:**
```sql
SELECT note_id, position, is_expanded
FROM app.tree_items
WHERE user_id = $1 AND parent_id = $2
ORDER BY position;
```

**Index scan:**
```
┌─────────────────────────┐
│ Index: (user_id, parent_id, position) │
├─────────────────────────┤
│ (alice, NULL, 1000)       ← finds all
│ (alice, NULL, 2000)       ← at this
│ (alice, NULL, 3000)       ← parent
│ ...                       │
└─────────────────────────┘
           ↓
Returns (note_id, is_expanded) from INCLUDE columns
No table touch needed! ✅ Index-only scan
```

---

## Query Performance

### Root Load (Most Common)

```sql
SELECT ti.note_id, n.title, n.is_folder, ti.position
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice'
  AND ti.parent_id IS NULL
ORDER BY ti.position;
```

**Execution:**
1. Index scan on `idx_tree_user_parent_pos` → finds all rows where `user_id=alice AND parent_id=NULL`
2. Already sorted by position (index is ordered)
3. Fetch 8 rows of notes metadata via JOIN
4. **Time:** ~50-100ms
5. **Returned rows:** 3-50 typically

### Children Load (Lazy Expansion)

```sql
WHERE ti.user_id = 'alice'
  AND ti.parent_id = '5555-...'
```

**Execution:**
1. Same index, but filtered to `parent_id = 5555...`
2. Typically 10-500 rows per folder
3. **Time:** ~30-80ms
4. Virtual list in UI renders only visible items

---

## Storage Footprint

### Per-User Estimate

User with 5000 notes:

**app.notes (5000 rows):**
```
5000 rows × 500 bytes/row = 2.5 MB
```

**app.tree_items (5000 rows):**
```
5000 rows × 200 bytes/row = 1 MB
```

**Indexes:**
```
~500 KB for composite index
~500 KB for other indexes
```

**Total per user:** ~4.5 MB

### Multi-Tenant (1000 users × 5000 notes)

```
5,000,000 notes × 500 bytes = 2.5 GB
5,000,000 tree_items × 200 bytes = 1 GB
Indexes = 1 GB
─────────────────────────────────────────
Total = 4.5 GB
```

**Fits on a single RDS db.t4g.xlarge instance.** ✓

---

## Summary Visual

```
┌──────────────────────────────────────┐
│         USER INTERFACE               │
│  (Sidebar tree with drag/drop)       │
└──────────────────────────────────────┘
                  ↓
         GET /api/tree/children
                  ↓
┌──────────────────────────────────────┐
│         API LAYER (Next.js)          │
│  Validates, calculates positions     │
└──────────────────────────────────────┘
                  ↓
         SQL Queries
                  ↓
┌──────────────────────────────────────┐
│      POSTGRESQL DATABASE             │
├──────────────────────────────────────┤
│ app.notes (metadata)                 │
│ app.tree_items (structure)           │
│ Indexes: (user_id, parent_id, pos)   │
│ Soft delete: deleted, deleted_at     │
│ Sharing: cloned_from FK              │
└──────────────────────────────────────┘
                  ↓
         S3 Bucket
│ (note content only, not structure)   │
└──────────────────────────────────────┘
```

The tree structure lives **100% in PostgreSQL**. S3 has no tree data.

This is the single source of truth. ✓
