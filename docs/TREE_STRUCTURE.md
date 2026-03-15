# File Tree Structure — ID & Parent Reference

## The Two Tables

```
┌─────────────────────────────────┐
│         app.notes               │
│ (What are the items?)           │
├─────────────────────────────────┤
│ note_id (UUID) ← ITEM ID        │
│ user_id (UUID)                  │
│ title (TEXT) ← sort by this     │
│ content, is_folder, ...         │
└─────────────────────────────────┘
         ↑           ↑
    note_id FK   cloned_from FK
         ↑           ↑
┌─────────────────────────────────┐
│       app.tree_items            │
│ (Where do they go?)             │
├─────────────────────────────────┤
│ id (UUID) ← TREE NODE ID        │
│ user_id (UUID)                  │
│ note_id (UUID FK)               │
│ parent_id (UUID FK) ← KEY!      │
│ is_expanded (BOOL)              │
└─────────────────────────────────┘
```

## Key: How Parent_id Works

**`parent_id` is a foreign key to `app.notes.note_id`** — not to `tree_items.id`.

This is the crucial point.

### Example

```
User Alice's tree:

Root
├─ Note A (note_id = 1111...)
└─ Note B (note_id = 2222...)
   ├─ Note C (note_id = 3333...)
   └─ Note D (note_id = 4444...)
```

**In `app.notes`:**
```
note_id       | title
──────────────────────
1111-1111-... | Note A
2222-2222-... | Note B
3333-3333-... | Note C
4444-4444-... | Note D
```

**In `app.tree_items`:**
```
id            | note_id       | parent_id
────────────────────────────────────────────
tree-1        | 1111-1111-... | NULL            (Note A @ root)
tree-2        | 2222-2222-... | NULL            (Note B @ root)
tree-3        | 3333-3333-... | 2222-2222-...   (Note C under B)
tree-4        | 4444-4444-... | 2222-2222-...   (Note D under B)
```

**Sorting:** When querying children, use `ORDER BY n.title ASC` to get A-Z order.

**The critical FKs:**
- `tree_items.note_id` → `notes.note_id` (this item IS this note)
- `tree_items.parent_id` → `notes.note_id` (this item's parent IS this note)

### Query Pattern

To get "children of Note B" (sorted A-Z):

```sql
SELECT ti.note_id, n.title
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = 'alice-uuid'
  AND ti.parent_id = '2222-2222-...'::uuid  -- ← parent_id is a note_id
ORDER BY n.title ASC;  -- ← A-Z sort
```

Result:
```
note_id       | title
──────────────────────
3333-3333-... | Note C
4444-4444-... | Note D
```

---

## Three IDs in Play

| ID | Table | Meaning | Used For |
|---|---|---|---|
| `app.notes.note_id` | notes | **What** is this item? | CREATE, UPDATE, DELETE, JOIN |
| `app.tree_items.id` | tree_items | Internal tree node ID | Rarely used (audit, debugging) |
| `app.tree_items.parent_id` | tree_items | **Who is the parent?** (references `notes.note_id`) | WHERE parent_id = X |

**You almost never use `tree_items.id` in queries.**

The key relationships are:
- `tree_items.note_id` → `notes.note_id` (what)
- `tree_items.parent_id` → `notes.note_id` (where)

---

## Example Operations

### Create a Note in Folder B

```sql
-- 1. Insert into notes
INSERT INTO app.notes (note_id, user_id, title, is_folder)
VALUES ('5555-...'::uuid, 'alice-uuid'::uuid, 'Note E', false);

-- 2. Insert into tree_items
INSERT INTO app.tree_items (user_id, note_id, parent_id)
VALUES ('alice-uuid'::uuid, '5555-...'::uuid, '2222-...'::uuid);
```

**That's it.** No position calculation. Will appear in A-Z order when folder is loaded.

### Move Note C from B to Root

```sql
UPDATE app.tree_items
SET parent_id = NULL  -- ← Move to root (no parent)
WHERE user_id = 'alice-uuid'::uuid
  AND note_id = '3333-...'::uuid;
```

Before:
```
tree-3 | note_id=3333-... | parent_id=2222-...
```

After:
```
tree-3 | note_id=3333-... | parent_id=NULL
```

Note C will now appear at root, in alphabetical position among other root items.

---

## Root vs Nested

**At root:** `parent_id = NULL`

```sql
SELECT * FROM app.tree_items
WHERE user_id = 'alice-uuid'
  AND parent_id IS NULL
ORDER BY position;
```

Gets: Note A, Note B (the root items)

**Under Note B:** `parent_id = '2222-...'` (Note B's `note_id`)

```sql
SELECT * FROM app.tree_items
WHERE user_id = 'alice-uuid'
  AND parent_id = '2222-...'::uuid
ORDER BY position;
```

Gets: Note C, Note D (B's children)

---

## Constraint

```sql
UNIQUE(user_id, note_id)
```

A note can appear **at most once** per user's tree. (Bob can have a clone of Alice's note, but it's a different `note_id`.)

## Foreign Keys

```sql
FOREIGN KEY (user_id) REFERENCES app.login(user_id) ON DELETE CASCADE
FOREIGN KEY (note_id) REFERENCES app.notes(note_id) ON DELETE CASCADE
FOREIGN KEY (parent_id) REFERENCES app.notes(note_id) ON DELETE CASCADE
```

If a note is deleted, all its `tree_items` entries are deleted (cascade).
If a note is a parent and gets deleted, all children are orphaned (cascade sets `parent_id` to NULL... actually, no, it would hard-delete the tree_items rows).

---

## Why This Design?

**Old (wrong) way:**
```
tree_items.parent_id → tree_items.id
```
A parent is a tree_items row, not a note.

**Why it fails:**
- What if the same note appears in two users' trees? (Can't, multiple tree_items rows for one note_id)
- Extra indirection (tree → tree → notes to get metadata)

**New (correct) way:**
```
tree_items.parent_id → notes.note_id
```
A parent is a note, which is in many users' trees.

**Why it works:**
- A note is an item. Its parent is another note.
- A user's tree_items row says: "This note is in my tree, under this parent note."
- The same note can be in multiple users' trees (clones).

---

## Sorting: A-Z Everywhere

No `position` column needed.

**Sorting strategy:**
- Folders sorted alphabetically (A-Z by title)
- Notes within folders sorted alphabetically (A-Z by title)
- Query: `ORDER BY n.title ASC`

**Example:**
```
📁 CT213
📁 University Notes
📋 Meeting Notes
📋 Personal TODO
```

Always the same order. Clean, predictable, no custom drag-and-drop needed.

---

## Summary

```
tree_items only has:
  - id (tree node UUID)
  - user_id (FK)
  - note_id (FK) — what is this item
  - parent_id (FK) — where does it go
  - is_expanded (UI state)
```

To get children in order:
```sql
SELECT * FROM tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = ? AND ti.parent_id = ?
ORDER BY n.title ASC;
```

That's the entire tree system. ✓
