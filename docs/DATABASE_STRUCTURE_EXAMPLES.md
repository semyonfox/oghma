# File Tree Database Structure — Complete Examples

This document shows exactly how the tree is structured in PostgreSQL with real example data.

---

## The Two Core Tables

### `app.notes` — Note/Folder Metadata

Every note AND every folder is a row in this table. Folders are distinguished by `is_folder = true`.

```sql
CREATE TABLE app.notes (
    note_id     UUID PRIMARY KEY,           -- UUIDv7, globally unique
    user_id     UUID NOT NULL,              -- Which user owns this
    title       TEXT NOT NULL,              -- Display name
    content     TEXT,                       -- Note body (TipTap JSON)
    s3_key      TEXT,                       -- Where content stored in S3
    is_folder   BOOLEAN NOT NULL DEFAULT false,  -- true = folder, false = leaf note
    deleted     SMALLINT NOT NULL DEFAULT 0,    -- 0 = active, 1 = soft-deleted
    deleted_at  TIMESTAMPTZ,                -- When soft-deleted (null = active)
    pinned      SMALLINT NOT NULL DEFAULT 0,    -- 0 = normal, 1 = pinned to top
    shared      SMALLINT NOT NULL DEFAULT 0,    -- 0 = private, 1 = discoverable
    cloned_from UUID,                       -- If this is a shared copy, points to original
    embedding   VECTOR(1536),               -- Phase 2: semantic search embeddings
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);
```

### `app.tree_items` — Tree Structure & Positioning

This table defines the **per-user** tree hierarchy. Each row says: "In user X's tree, note A is a child of note B (or root if parent_id is NULL), at position P."

```sql
CREATE TABLE app.tree_items (
    id          UUID PRIMARY KEY,           -- Internal tree node ID (not used for display)
    user_id     UUID NOT NULL,              -- Which user owns this tree branch
    note_id     UUID NOT NULL,              -- References app.notes.note_id
    parent_id   UUID,                       -- References app.notes.note_id (parent), NULL = root
    position    DOUBLE PRECISION NOT NULL,  -- Order within parent (1000, 2000, 4500...)
    is_expanded BOOLEAN NOT NULL DEFAULT false,  -- UI state: folder collapsed/open
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES app.login(user_id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES app.notes(note_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES app.notes(note_id) ON DELETE CASCADE,
    UNIQUE(user_id, note_id)  -- One entry per (user, note) pair
);
```

**Key insight:** The tree is a **directed acyclic graph (DAG)**. A note can appear in multiple users' trees (as a clone), but only once per user.

---

## Example 1: Simple Folder Structure

### Scenario

User Alice creates a structure like this in her sidebar:

```
📁 My Projects
  ├─ 📋 Project A Design
  └─ 📋 Project B Planning
📁 University Notes
  ├─ 📁 CT213
  │  ├─ 📋 Lecture 1
  │  └─ 📋 Lecture 2
  └─ 📋 General Notes
📋 Personal TODO
```

### Data in `app.notes`

Alice owns 8 items:

| note_id | title | is_folder | deleted | user_id |
|---|---|---|---|---|
| `1111...` | My Projects | true | 0 | `alice-uuid` |
| `2222...` | Project A Design | false | 0 | `alice-uuid` |
| `3333...` | Project B Planning | false | 0 | `alice-uuid` |
| `4444...` | University Notes | true | 0 | `alice-uuid` |
| `5555...` | CT213 | true | 0 | `alice-uuid` |
| `6666...` | Lecture 1 | false | 0 | `alice-uuid` |
| `7777...` | Lecture 2 | false | 0 | `alice-uuid` |
| `8888...` | General Notes | false | 0 | `alice-uuid` |
| `9999...` | Personal TODO | false | 0 | `alice-uuid` |

### Data in `app.tree_items`

Alice's tree has 9 entries (one per item). Each entry shows the parent relationship and position.

| id | user_id | note_id | parent_id | position | is_expanded |
|---|---|---|---|---|---|
| `tree-1` | `alice-uuid` | `1111...` | NULL | 1000 | true |
| `tree-2` | `alice-uuid` | `2222...` | `1111...` | 1000 | false |
| `tree-3` | `alice-uuid` | `3333...` | `1111...` | 2000 | false |
| `tree-4` | `alice-uuid` | `4444...` | NULL | 2000 | true |
| `tree-5` | `alice-uuid` | `5555...` | `4444...` | 1000 | true |
| `tree-6` | `alice-uuid` | `6666...` | `5555...` | 1000 | false |
| `tree-7` | `alice-uuid` | `7777...` | `5555...` | 2000 | false |
| `tree-8` | `alice-uuid` | `8888...` | `4444...` | 2000 | false |
| `tree-9` | `alice-uuid` | `9999...` | NULL | 3000 | false |

### Breaking It Down

**Root level items** (`parent_id = NULL`):
- `1111...` (My Projects) at position 1000
- `4444...` (University Notes) at position 2000
- `9999...` (Personal TODO) at position 3000

**Children of My Projects** (`parent_id = 1111...`):
- `2222...` (Project A Design) at position 1000
- `3333...` (Project B Planning) at position 2000

**Children of University Notes** (`parent_id = 4444...`):
- `5555...` (CT213) at position 1000
- `8888...` (General Notes) at position 2000

**Children of CT213** (`parent_id = 5555...`):
- `6666...` (Lecture 1) at position 1000
- `7777...` (Lecture 2) at position 2000

### SQL to Get Alice's Root

```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position,
  ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'::uuid
  AND ti.parent_id IS NULL  -- ROOT ONLY
ORDER BY ti.position
```

**Result:**
```
note_id | title | is_folder | position | is_expanded
1111... | My Projects | t | 1000 | t
4444... | University Notes | t | 2000 | t
9999... | Personal TODO | f | 3000 | f
```

### SQL to Get Children of "CT213"

```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'::uuid
  AND ti.parent_id = '5555...'::uuid  -- CT213 UUID
ORDER BY ti.position
```

**Result:**
```
note_id | title | is_folder | position
6666... | Lecture 1 | f | 1000
7777... | Lecture 2 | f | 2000
```

---

## Example 2: What Happens on a Move?

### Scenario

Alice drags "Lecture 1" from CT213 → Personal TODO.

**Before:**
```
CT213:
  ├─ Lecture 1  ← Being moved
  └─ Lecture 2

Personal TODO (currently a leaf)
```

**Operation:** `POST /api/tree`
```json
{
  "action": "move",
  "data": {
    "source": { "parentId": "5555...", "index": 0 },
    "destination": { "parentId": "9999...", "index": 0 }
  }
}
```

**Server logic:**

1. Get siblings in destination folder:
   ```sql
   SELECT position FROM app.tree_items
   WHERE user_id = 'alice-uuid'::uuid
     AND parent_id = '9999...'::uuid
   ORDER BY position
   LIMIT 1 OFFSET 0;
   ```
   **Result:** No rows (Personal TODO has no children)

2. Calculate new position:
   - No existing children → `position = (0 + 1) * 1000 = 1000`

3. Update the tree item:
   ```sql
   UPDATE app.tree_items
   SET parent_id = '9999...'::uuid,
       position = 1000,
       updated_at = NOW()
   WHERE user_id = 'alice-uuid'::uuid
     AND note_id = '6666...'::uuid;
   ```

**After:**
```
CT213:
  └─ Lecture 2  (position 2000, unchanged)

Personal TODO:
  └─ Lecture 1  (position 1000, NEW)
```

**Database state:**

| user_id | note_id | parent_id | position |
|---|---|---|---|
| alice | `6666...` | `9999...` | **1000** ← CHANGED |
| alice | `7777...` | `5555...` | 2000 ← unchanged |

**Only 1 row changed.** No cascading updates. No other positions affected. ✅

---

## Example 3: Drag Within Same Folder (Reordering)

### Scenario

Alice drags "Lecture 1" to the end of the CT213 folder (below "Lecture 2").

**Before:**
```
CT213:
  ├─ Lecture 1 (pos 1000) ← Being moved
  └─ Lecture 2 (pos 2000)
```

**Operation:**
```json
{
  "action": "move",
  "data": {
    "source": { "parentId": "5555...", "index": 0 },
    "destination": { "parentId": "5555...", "index": 1 }
  }
}
```

**Server logic:**

1. Get siblings at destination.index:
   ```sql
   SELECT position FROM app.tree_items
   WHERE user_id = 'alice-uuid'::uuid
     AND parent_id = '5555...'::uuid
   ORDER BY position
   LIMIT 1 OFFSET 1;  -- Get the item at index 1
   ```
   **Result:** `position = 2000` (Lecture 2)

2. Calculate new position (between index 0 and index 1):
   - Previous sibling (index 0): `position = 1000`
   - Next sibling (index 1): `position = 2000`
   - New position = `(1000 + 2000) / 2 = 1500`

3. Update:
   ```sql
   UPDATE app.tree_items
   SET position = 1500,
       updated_at = NOW()
   WHERE user_id = 'alice-uuid'::uuid
     AND note_id = '6666...'::uuid;
   ```

**After:**
```
CT213:
  ├─ Lecture 2 (pos 2000)
  └─ Lecture 1 (pos 1500) ← Moved to bottom
```

**Database state:**

| user_id | note_id | parent_id | position | title |
|---|---|---|---|---|
| alice | `6666...` | `5555...` | **1500** ← CHANGED |
| alice | `7777...` | `5555...` | 2000 ← unchanged |

**Only 1 row changed.** Gap insertion (midpoint) works perfectly. ✅

### What Makes This Possible?

Position values have **room between them:**
- Start with 1000, 2000 (gap of 1000)
- After insert at midpoint: 1500 (gap of 500 on each side)
- Can continue: 1250, 1375, 1437.5, ...

This avoids the problem of sequential integers where you'd have to rewrite all subsequent rows on every insert.

---

## Example 4: Creating a New Note

### Scenario

Alice creates a note "Lecture 3" inside CT213 folder.

**User action:** Click "+" in CT213 folder

**Request:**
```json
POST /api/notes
{
  "title": "Lecture 3",
  "content": "\n",
  "pid": "5555..."  // CT213 UUID
}
```

**Server generates:** `noteId = generateUUID()` → `aaaa...` (UUIDv7)

**Transaction:**

1. Insert into `app.notes`:
   ```sql
   INSERT INTO app.notes (
     note_id, user_id, title, content, is_folder, deleted, created_at, updated_at
   ) VALUES (
     'aaaa...'::uuid,
     'alice-uuid'::uuid,
     'Lecture 3',
     '\n',
     false,  -- is_folder = false (it's a leaf note)
     0,
     NOW(),
     NOW()
   ) RETURNING note_id;
   ```

2. Get max position in CT213:
   ```sql
   SELECT COALESCE(MAX(position), 0) as max_pos
   FROM app.tree_items
   WHERE user_id = 'alice-uuid'::uuid
     AND parent_id = '5555...'::uuid;
   ```
   **Result:** `2000` (Lecture 2 is at 2000)

3. Calculate new position: `2000 + 1000 = 3000`

4. Insert into `app.tree_items`:
   ```sql
   INSERT INTO app.tree_items (
     user_id, note_id, parent_id, position, is_expanded
   ) VALUES (
     'alice-uuid'::uuid,
     'aaaa...'::uuid,
     '5555...'::uuid,
     3000,
     false
   );
   ```

**Result:**

app.notes gains:
| note_id | title | is_folder | user_id |
|---|---|---|---|
| `aaaa...` | Lecture 3 | false | alice |

app.tree_items gains:
| user_id | note_id | parent_id | position | is_expanded |
|---|---|---|---|---|
| alice | `aaaa...` | `5555...` | 3000 | false |

**UI immediately shows:**
```
CT213:
  ├─ Lecture 1 (pos 1500)
  ├─ Lecture 2 (pos 2000)
  └─ Lecture 3 (pos 3000) ← NEW
```

---

## Example 5: Soft Delete

### Scenario

Alice deletes "Lecture 3".

**User action:** Right-click → Delete

**Request:**
```
DELETE /api/notes/aaaa...
```

**Server operations:**

1. Soft-delete the note:
   ```sql
   UPDATE app.notes
   SET deleted = 1,
       deleted_at = NOW()
   WHERE note_id = 'aaaa...'::uuid
     AND user_id = 'alice-uuid'::uuid;
   ```

2. Remove from tree:
   ```sql
   DELETE FROM app.tree_items
   WHERE user_id = 'alice-uuid'::uuid
     AND note_id = 'aaaa...'::uuid;
   ```

3. Delete attachments (cascade):
   ```sql
   DELETE FROM app.attachments
   WHERE note_id = 'aaaa...'::uuid;
   ```

**Result:**

app.notes now shows:
| note_id | title | deleted | deleted_at | user_id |
|---|---|---|---|---|
| `aaaa...` | Lecture 3 | **1** | **2025-03-15 10:45:23** | alice |

app.tree_items:
```
(aaaa... row deleted)
```

**UI shows:**
```
CT213:
  ├─ Lecture 1
  └─ Lecture 2
     (Lecture 3 gone)
```

**After 7 days**, background job runs:
```sql
DELETE FROM app.notes
WHERE deleted = 1
  AND deleted_at < NOW() - INTERVAL '7 days';
```

Then `aaaa...` is permanently gone.

---

## Example 6: Sharing (Cloning)

### Scenario

Alice shares "Personal TODO" with Bob.

**User action:** Right-click Personal TODO → "Share with Bob"

**Request:**
```json
POST /api/notes/9999.../share
{
  "targetUserId": "bob-uuid",
  "targetParentId": null  // goes to his root
}
```

**Server generates:** `cloneId = generateUUID()` → `bbbb...` (UUIDv7)

**Transaction:**

1. Insert clone in Bob's notes:
   ```sql
   INSERT INTO app.notes (
     note_id, user_id, title, content, s3_key, is_folder, 
     cloned_from, deleted, created_at, updated_at
   ) VALUES (
     'bbbb...'::uuid,
     'bob-uuid'::uuid,
     'Personal TODO (shared by Alice)',
     (SELECT content FROM app.notes WHERE note_id = '9999...'),
     (SELECT s3_key FROM app.notes WHERE note_id = '9999...'),
     false,
     '9999...'::uuid,  -- cloned_from points to original
     0,
     NOW(),
     NOW()
   );
   ```

2. Add to Bob's tree at root:
   ```sql
   INSERT INTO app.tree_items (
     user_id, note_id, parent_id, position, is_expanded
   ) VALUES (
     'bob-uuid'::uuid,
     'bbbb...'::uuid,
     NULL,  -- root
     4000,  -- after his existing root items
     false
   );
   ```

**Result:**

Alice's app.notes:
| note_id | title | user_id | cloned_from |
|---|---|---|---|
| `9999...` | Personal TODO | alice | NULL ← original |

Bob's app.notes (NEW):
| note_id | title | user_id | cloned_from |
|---|---|---|---|
| `bbbb...` | Personal TODO (shared by Alice) | bob | **`9999...`** ← clone |

Bob's tree now shows:
```
📁 My Projects
📁 University Notes
📋 Personal TODO (shared by Alice) ← NEW, independent copy
```

**Key points:**
- Different `note_id` (UUIDs)
- Different `user_id` (Alice vs Bob)
- Different content (Bob can edit without affecting Alice)
- `cloned_from` tracks the original
- No sync between them

---

## Example 7: Two Users, Same User Two Devices

### Scenario

Alice has laptop and phone. On laptop, she creates "Meeting Notes". Then opens app on phone.

**Laptop creates:**

app.notes:
| note_id | user_id | title |
|---|---|---|
| `cccc...` | alice | Meeting Notes |

app.tree_items:
| user_id | note_id | parent_id | position |
|---|---|---|
| alice | `cccc...` | NULL | 4000 |

**Phone loads tree:**

```sql
SELECT ti.note_id, n.title, ti.position
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'::uuid
  AND ti.parent_id IS NULL
ORDER BY ti.position
```

**Result:**
```
note_id | title | position
9999... | Personal TODO | 3000
cccc... | Meeting Notes | 4000  ← NEW, created on laptop
```

Phone sees it immediately. ✅

---

## Example 8: Orphaned Note (Shouldn't Happen, But...)

### Scenario

Database corruption or edge case creates a note without a tree_item.

**Data inconsistency:**

app.notes:
| note_id | title | user_id |
|---|---|---|
| `dddd...` | Orphaned Note | alice |

app.tree_items:
```
(no row for dddd...)
```

**Detection:**

```sql
SELECT n.note_id, n.title
FROM app.notes n
WHERE n.user_id = 'alice-uuid'::uuid
  AND n.deleted = 0 AND n.deleted_at IS NULL
  AND n.note_id NOT IN (
    SELECT note_id FROM app.tree_items
    WHERE user_id = 'alice-uuid'::uuid
  );
```

**Result:**
```
note_id | title
dddd... | Orphaned Note
```

**Recovery:**

```sql
INSERT INTO app.tree_items (
  user_id, note_id, parent_id, position
) VALUES (
  'alice-uuid'::uuid,
  'dddd...'::uuid,
  NULL,  -- add to root
  5000,
);
```

Now visible in Alice's root.

---

## Example 9: Deep Nesting

### Scenario

Alice has a structure:
```
📁 Level 1
  📁 Level 2
    📁 Level 3
      📋 Note at Depth 4
```

**Tree structure:**

| parent_id | note_id | title | depth |
|---|---|---|---|
| NULL | `l1...` | Level 1 | 0 (root) |
| `l1...` | `l2...` | Level 2 | 1 |
| `l2...` | `l3...` | Level 3 | 2 |
| `l3...` | `note...` | Note at Depth 4 | 3 |

**To find the path to a note:**

```sql
WITH RECURSIVE path AS (
  SELECT note_id, parent_id, title, 1 as depth
  FROM app.tree_items ti
  JOIN app.notes n ON ti.note_id = n.note_id
  WHERE ti.user_id = 'alice-uuid'::uuid AND ti.note_id = 'note...'::uuid
  
  UNION ALL
  
  SELECT ti.note_id, ti.parent_id, n.title, path.depth + 1
  FROM path
  JOIN app.tree_items ti ON path.parent_id = ti.note_id
  JOIN app.notes n ON ti.note_id = n.note_id
  WHERE ti.user_id = 'alice-uuid'::uuid
)
SELECT note_id, title, depth FROM path ORDER BY depth DESC;
```

**Result:**
```
note_id | title | depth
note... | Note at Depth 4 | 1
l3...   | Level 3 | 2
l2...   | Level 2 | 3
l1...   | Level 1 | 4
```

Breadcrumb in UI: `Level 1 / Level 2 / Level 3 / Note at Depth 4` ✅

---

## Example 10: Circular Reference (Impossible, but Detection)

### Scenario

Hypothetically, if validation failed and A → B → C → A created:

| parent_id | note_id | title |
|---|---|---|
| `b...` | `a...` | Note A |
| `c...` | `b...` | Note B |
| `a...` | `c...` | Note C |

**Detection with recursive CTE:**

```sql
WITH RECURSIVE check_circle AS (
  SELECT note_id, parent_id, 1 as depth
  FROM app.tree_items
  WHERE user_id = 'alice-uuid'::uuid AND parent_id IS NOT NULL
  
  UNION ALL
  
  SELECT cc.note_id, ti.parent_id, cc.depth + 1
  FROM check_circle cc
  JOIN app.tree_items ti ON ti.note_id = cc.parent_id
  WHERE ti.user_id = 'alice-uuid'::uuid AND cc.depth < 100
)
SELECT note_id, parent_id FROM check_circle
WHERE note_id = parent_id;
```

**Result:** Detects circular reference. Admin deletes circular edge.

---

## Index Strategy

### Queries and Their Indexes

| Query | Index Used |
|---|---|
| `SELECT * FROM tree_items WHERE user_id = ? AND parent_id = ? ORDER BY position` | `idx_tree_user_parent_pos(user_id, parent_id, position)` |
| `SELECT * FROM tree_items WHERE user_id = ? AND parent_id IS NULL` | `idx_tree_user_parent_pos` (covers NULL) |
| `SELECT * FROM notes WHERE user_id = ? AND deleted = 0` | `idx_notes_user_active(user_id)` |
| `SELECT * FROM notes WHERE deleted_at IS NOT NULL` | `idx_notes_trash(user_id, deleted_at)` |

**Composite index key:** `(user_id, parent_id, position)` with INCLUDE `(note_id, is_expanded)`

Enables **index-only scans** — PostgreSQL never touches the table, only reads index.

---

## Storage Calculation

### Example User (Alice with 5000 notes)

**app.notes (one row per note):**
- 5000 rows × ~500 bytes = ~2.5 MB

**app.tree_items (one row per note per user, only Alice):**
- 5000 rows × ~200 bytes = ~1 MB

**Total per user:** ~3.5 MB (very small)

**1000 users × 5000 notes each:**
- 5 million notes × 500 bytes = ~2.5 GB
- 5 million tree_items × 200 bytes = ~1 GB
- **Total: ~3.5 GB** (fits on one mid-tier RDS instance)

Indexes add ~1 GB, bringing total to ~4.5 GB. Still very manageable.

---

## Summary: How the Tree Works

| Concept | Implementation |
|---|---|
| **Folders** | `is_folder = true` in app.notes |
| **Hierarchy** | `parent_id` FK in tree_items |
| **Ordering** | `position` DOUBLE PRECISION (gap-safe) |
| **Isolation** | Every query filters on `user_id` |
| **Soft delete** | `deleted = 1` + `deleted_at` timestamp |
| **Sharing** | Clone with `cloned_from` FK |
| **Concurrency** | `SELECT ... FOR UPDATE` lock on parent |
| **Traversal** | Recursive CTEs for paths/depth |
| **Performance** | Composite index + lazy load |

---

## Visual: What's in Each Table

### app.notes — "What are the things?"

```
✓ Note metadata (title, content, etc.)
✓ Folder flag (is_folder)
✓ Soft delete markers
✓ Sharing/clone info
✓ User ownership
```

### app.tree_items — "How are they organized?"

```
✓ Parent-child relationships
✓ Position/ordering
✓ Expand state
✓ Per-user tree instances
```

### The key insight:

**Separation of concerns.**

- `app.notes` answers: "What note is this?"
- `app.tree_items` answers: "Where does it go in my tree?"

A note can be in many trees (clones). Each tree_item is unique to that (user, note) pair.

This is why `UNIQUE(user_id, note_id)` prevents duplicates — Alice can't have the same note appear twice in her tree, but Bob can have a clone of it in his.

---

## Querying the Tree: Common Patterns

### Get root items for user

```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position,
  ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid
  AND ti.parent_id IS NULL
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY ti.position;
```

### Get children of a folder

```sql
SELECT 
  ti.note_id, 
  n.title, 
  n.is_folder,
  ti.position,
  ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid
  AND ti.parent_id = $2::uuid
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY ti.position;
```

### Get path to a note (breadcrumb)

```sql
WITH RECURSIVE path_up AS (
  SELECT note_id, parent_id, 1 as step
  FROM app.tree_items
  WHERE user_id = $1::uuid AND note_id = $2::uuid
  
  UNION ALL
  
  SELECT ti.note_id, ti.parent_id, path_up.step + 1
  FROM path_up
  JOIN app.tree_items ti ON ti.note_id = path_up.parent_id
  WHERE ti.user_id = $1::uuid
)
SELECT ti.note_id, n.title
FROM path_up
JOIN app.tree_items ti ON ti.note_id = path_up.note_id
JOIN app.notes n ON n.note_id = ti.note_id
ORDER BY step DESC;
```

### Move a note (atomically)

```sql
BEGIN;
  -- Lock sibling list
  SELECT id FROM app.tree_items
  WHERE user_id = $1::uuid AND parent_id = $4::uuid
  FOR UPDATE;
  
  -- Update the moved note
  UPDATE app.tree_items
  SET parent_id = $4::uuid,
      position = $5,
      updated_at = NOW()
  WHERE user_id = $1::uuid AND note_id = $2::uuid;
COMMIT;
```

---

## Key Takeaways

1. **Everything is a node:** Notes and folders are both rows in `app.notes`. `is_folder` distinguishes them.

2. **Tree is in tree_items:** The hierarchy lives in `app.tree_items`, not in notes itself.

3. **Per-user isolation:** Each user has their own tree. `user_id` is the partition key.

4. **Gap-based positions:** Positions are spaced (1000, 2000, 4500...) to allow O(1) inserts without rewriting siblings.

5. **Soft delete is transparent:** Deleted notes stay in the DB for 7 days, but queries filter them out with `WHERE deleted = 0 AND deleted_at IS NULL`.

6. **Cloning via FK:** Shared notes are independent clones, tracked by `cloned_from`.

7. **Concurrent safe:** Lock parent folder during position calculation.

8. **Queryable structure:** Use recursive CTEs to find paths, detect cycles, check integrity.

This design supports **millions of notes** with **zero schema changes** needed.
