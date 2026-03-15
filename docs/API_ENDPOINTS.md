# Tree API Endpoints

## Root Tree (Initial Load)

**GET /api/tree**

Fetch root level items for authenticated user. Sorted A-Z by title.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/tree
```

Response:
```json
{
  "rootId": "root",
  "items": {
    "root": { "id": "root", "children": ["note-uuid-1", "note-uuid-2"] },
    "note-uuid-1": { "id": "note-uuid-1", "children": [] },
    "note-uuid-2": { "id": "note-uuid-2", "children": ["note-uuid-3"] }
  }
}
```

---

## Lazy Load Children (Expanded Folder)

**GET /api/tree/children?parent_id=<uuid>**

Fetch children of a folder. Omit `parent_id` for root.

```bash
# Get children of a folder
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/tree/children?parent_id=note-uuid-2"

# Get root items (parent_id omitted)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/tree/children"
```

Response:
```json
{
  "parentId": "note-uuid-2",
  "items": [
    { "id": "note-uuid-3", "title": "Child A", "isFolder": false, "isExpanded": false },
    { "id": "note-uuid-4", "title": "Child B", "isFolder": true, "isExpanded": false }
  ]
}
```

---

## Create Note (in a folder)

**POST /api/notes**

Create new note, optionally in a parent folder.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Note","content":"\n","pid":"parent-uuid"}' \
  http://localhost:3000/api/notes
```

Response (201 Created):
```json
{
  "id": "note-uuid-5",
  "title": "My Note",
  "content": "\n",
  "deleted": 0,
  "shared": 0,
  "pinned": 0
}
```

**Note:** `pid` (parent_id) is optional. If provided, note is created under that folder. If omitted, note goes to root.

---

## Move Note (to different folder)

**POST /api/tree**

Move a note from one parent to another.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "move",
    "data": {
      "source": { "parentId": "old-parent-uuid", "index": 0 },
      "destination": { "parentId": "new-parent-uuid", "index": 0 }
    }
  }' \
  http://localhost:3000/api/tree
```

Response:
```json
{ "success": true }
```

**Note:** The note will appear in A-Z sorted position within the new parent.

---

## Expand/Collapse Folder

**POST /api/tree**

Toggle folder expanded state.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "mutate",
    "data": {
      "id": "note-uuid-2",
      "isExpanded": true
    }
  }' \
  http://localhost:3000/api/tree
```

Response:
```json
{ "success": true }
```

---

## Share Note (Clone to Another User)

**POST /api/notes/:id/share**

Clone a note to another user's workspace.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "other-user-uuid",
    "targetParentId": null
  }' \
  http://localhost:3000/api/notes/note-uuid-1/share
```

Response (201 Created):
```json
{
  "success": true,
  "clonedNoteId": "new-clone-uuid",
  "message": "Note cloned to target user"
}
```

**Note:**
- Clone gets a new UUID and is owned by target user
- `cloned_from` FK points to original
- Target user can edit/delete independently
- No sync between original and clone

---

## Delete Note (Soft Delete)

**DELETE /api/notes/:id**

Soft-delete a note (hidden for 7 days, then hard-deleted).

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notes/note-uuid-1
```

Response:
```json
{ "success": true }
```

---

## Tree Integrity Check

**GET /api/tree/status**

Check tree health: orphaned notes, total stats.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/tree/status
```

Response (healthy):
```json
{
  "status": "healthy",
  "orphanedNotes": 0,
  "totalNotes": 15,
  "totalFolders": 3,
  "totalFiles": 12,
  "message": "Tree structure is intact"
}
```

Response (issues):
```json
{
  "status": "issues",
  "orphanedNotes": 2,
  "totalNotes": 15,
  "totalFolders": 3,
  "totalFiles": 12,
  "message": "2 orphaned note(s) found"
}
```

---

## Query Flow

### Load Tree (User Opens App)

1. `GET /api/tree` → root items only
2. Frontend renders root with disclosure triangles
3. User expands folder → `GET /api/tree/children?parent_id=...`
4. Frontend fetches and renders children

### Create Note in Folder

1. `POST /api/notes` with `pid=parent-uuid`
2. Server inserts note + adds to tree_items
3. Note appears in parent's A-Z sorted list

### Move Note to Different Folder

1. `POST /api/tree` with move action
2. Server updates `parent_id` in tree_items
3. Note disappears from old parent, appears in new parent (A-Z sorted)

### Share Note

1. `POST /api/notes/:id/share` with target user and parent
2. Server creates clone with `cloned_from` FK
3. Target user sees independent copy in their tree

### Check Tree Health

1. `GET /api/tree/status`
2. Reports orphaned notes, total items, folders vs files

---

## Database Queries (for reference)

### Get root items
```sql
SELECT ti.note_id, n.title, n.is_folder, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid AND ti.parent_id IS NULL
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY n.title ASC;
```

### Get children of a folder
```sql
SELECT ti.note_id, n.title, n.is_folder, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid AND ti.parent_id = $2::uuid
  AND n.deleted = 0 AND n.deleted_at IS NULL
ORDER BY n.title ASC;
```

### Create note
```sql
BEGIN;
  INSERT INTO app.notes (note_id, user_id, title, content, is_folder)
  VALUES ($1::uuid, $2::uuid, $3, $4, false);
  
  INSERT INTO app.tree_items (user_id, note_id, parent_id)
  VALUES ($2::uuid, $1::uuid, $5::uuid);
COMMIT;
```

### Move note
```sql
UPDATE app.tree_items
SET parent_id = $2::uuid
WHERE user_id = $1::uuid AND note_id = $3::uuid;
```
