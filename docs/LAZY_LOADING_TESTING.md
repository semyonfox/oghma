# lazy loading tree - test this

basically the tree only loads what you need now. open the page, get root items fast. click a folder, it loads its kids. no more downloading 10k notes at once.

## endpoints

```
/api/tree (GET)              → just root items, fast
/api/tree/children (GET)     → kids of a folder
/api/tree/status (GET)       → tree health (orphans, etc)
/api/tree (POST)             → move stuff around
/api/notes/[id]/share (POST) → clone notes
```

## stuff to test

### 1. page loads fast

- open devtools → network tab
- go to `/notes`
- should see GET /api/tree hit
- response: `{ parentId: "root", items: [{ id, title, isFolder, isExpanded }, ...] }`
- should take like 100-200ms tops
- root folders show up right away

✓ **looks good if**: folders appear instantly, tree request is fast

### 2. expand folder = load children

- click the arrow next to a folder
- network should show GET /api/tree/children?parent_id=<id>
- kids appear after 50-200ms
- no full tree download

✓ **looks good if**: you see the children request, kids load

### 3. nested folders work same way

- expand a folder
- expand one of its kids (if it's also a folder)
- same pattern repeats
- each level loads separately

✓ **looks good if**: you can go as deep as you want, each level loads on demand

### 4. don't re-fetch (caching)

- expand folder A (watch network, see request)
- collapse it
- expand it again
- **should NOT see a new request**
- kids appear instantly from cache

✓ **looks good if**: no duplicate requests

### 5. create note in root

- click create button
- new note appears instantly
- no API call to children (it's in memory now)

✓ **looks good if**: it's instant

### 6. create note in a folder

- expand a folder
- create a note in it (context menu or whatever)
- appears right away
- should persist if you refresh

✓ **looks good if**: note appears, doesn't disappear on refresh

### 7. drag notes around

- drag a note from one folder to another
- network shows POST /api/tree with move action
- tree updates after response
- both folders' lists change

✓ **looks good if**: dragging works, tree updates correctly

### 8. share a note

- right-click note → share (if it exists)
- pick another user
- POST /api/notes/:id/share happens
- other user sees a clone in their tree

✓ **looks good if**: clone appears, is independent

## what the API returns

### root items
```json
{
  "parentId": "root",
  "items": [
    { "id": "uuid-v7", "title": "My Folder", "isFolder": true, "isExpanded": false },
    { "id": "uuid-v7", "title": "My Note", "isFolder": false, "isExpanded": false }
  ]
}
```

### children of a folder
```json
{
  "parentId": "<uuid>",
  "items": [
    { "id": "uuid-v7", "title": "Nested Item", "isFolder": false, "isExpanded": false }
  ]
}
```

## debugging

### check tree state in console

```javascript
import useNoteTreeStore from '@/lib/notes/state/tree';

const state = useNoteTreeStore.getState();
console.log(state.tree.items);        // all items loaded so far
console.log(state.loadingChildren);   // folders currently loading
console.log(state.initLoaded);        // is init done?
```

### watch network requests

- devtools → network
- filter fetch/xhr
- watch for:
  - `/api/tree` (first load)
  - `/api/tree/children?parent_id=...` (when you expand)
  - `/api/tree` POST (drag, rename, etc)

### check database

```sql
-- what's the tree look like for this user?
SELECT * FROM app.tree_items WHERE user_id = 'user-uuid' LIMIT 20;

-- any orphaned notes?
SELECT * FROM app.notes WHERE user_id = 'user-uuid' 
  AND note_id NOT IN (SELECT note_id FROM app.tree_items WHERE user_id = 'user-uuid');
```

## rough timings

| thing | time | why |
|------|------|-----|
| page loads | ~100-200ms | just root items |
| expand folder | 50-200ms | depends how many kids |
| expand again | <10ms | cached, instant |
| create note | ~100ms | local + api |
| drag note | 100-300ms | local + api |

## gotchas / future stuff

1. **search doesn't work across unloaded folders** - only searches what's open
   - fix: server-side search
2. **can't jump to deep folders** - gotta expand from top
   - fix: breadcrumb navigation
3. **if a folder has 1000s of items, loads em all**
   - fix: pagination (offset/limit)

## if it breaks

revert the commits and go back to loading full tree. done.

## files that changed

- `src/lib/notes/api/tree.ts` - added fetchChildren
- `src/lib/notes/state/tree.ts` - added loadChildren
- `src/components/notes/sidebar/sidebar-list.tsx` - triggers load on expand
- `src/app/api/tree/route.ts` - simplified
