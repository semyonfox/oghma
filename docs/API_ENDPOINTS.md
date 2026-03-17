# API Endpoints

## get root items

**GET /api/tree**

just the root stuff. fast. sorted a-z.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/tree
```

```json
{
  "parentId": "root",
  "items": [
    { "id": "uuid", "title": "My Folder", "isFolder": true, "isExpanded": false },
    { "id": "uuid", "title": "Note", "isFolder": false, "isExpanded": false }
  ]
}
```

kids load separately when you expand. keeps initial load snappy.

## get folder's kids

**GET /api/tree/children?parent_id=<uuid>**

load children when you expand a folder. a-z sorted.

```bash
# kids of a folder
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/tree/children?parent_id=uuid"
```

```json
{
  "parentId": "uuid",
  "items": [
    { "id": "uuid", "title": "Kid A", "isFolder": false, "isExpanded": false },
    { "id": "uuid", "title": "Kid B", "isFolder": true, "isExpanded": false }
  ]
}
```

## create note

**POST /api/notes**

make a note. optional parent folder.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Note","content":"\n","pid":"parent-uuid"}' \
  http://localhost:3000/api/notes
```

```json
{ "id": "uuid", "title": "My Note", "content": "\n", "deleted": 0, "shared": 0, "pinned": 0 }
```

`pid` is optional. no pid = goes to root.

## move note

**POST /api/tree**

move stuff between folders.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "move",
    "data": {
      "source": { "parentId": "old-uuid", "index": 0 },
      "destination": { "parentId": "new-uuid", "index": 0 }
    }
  }' \
  http://localhost:3000/api/tree
```

```json
{ "success": true }
```

appears a-z sorted in new parent.

## toggle folder expanded

**POST /api/tree**

expand/collapse state.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "action": "mutate", "data": { "id": "uuid", "isExpanded": true } }' \
  http://localhost:3000/api/tree
```

```json
{ "success": true }
```

## share note (clone)

**POST /api/notes/:id/share**

copy note to another user.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "targetUserId": "other-uuid", "targetParentId": null }' \
  http://localhost:3000/api/notes/uuid/share
```

```json
{ "success": true, "clonedNoteId": "new-uuid", "message": "Note cloned" }
```

independent copy. changes don't sync. `cloned_from` tracks original.

## delete note

**DELETE /api/notes/:id**

soft delete (gone for 7 days then nuked).

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/notes/uuid
```

```json
{ "success": true }
```

## tree health check

**GET /api/tree/status**

orphaned notes, stats, etc.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/tree/status
```

```json
{
  "status": "healthy",
  "orphanedNotes": 0,
  "totalNotes": 15,
  "totalFolders": 3,
  "totalFiles": 12
}
```

## typical flow

1. user opens app → `GET /api/tree` (root items)
2. user expands folder → `GET /api/tree/children?parent_id=...`
3. user creates note → `POST /api/notes` with pid
4. user drags note → `POST /api/tree` with move action
5. user shares → `POST /api/notes/:id/share`

## db queries

```sql
-- root
SELECT ti.note_id, n.title, n.is_folder, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid AND ti.parent_id IS NULL
ORDER BY n.title ASC;

-- kids of folder
SELECT ti.note_id, n.title, n.is_folder, ti.is_expanded
FROM app.tree_items ti
JOIN app.notes n ON ti.note_id = n.note_id
WHERE ti.user_id = $1::uuid AND ti.parent_id = $2::uuid
ORDER BY n.title ASC;

-- create note
BEGIN;
INSERT INTO app.notes (...) VALUES (...);
INSERT INTO app.tree_items (...) VALUES (...);
COMMIT;

-- move note
UPDATE app.tree_items SET parent_id = $2::uuid WHERE user_id = $1::uuid AND note_id = $3::uuid;
```
