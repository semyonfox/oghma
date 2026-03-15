# Lazy-Loading Tree System - Testing Guide

## Overview

The tree system now uses lazy-loading to scale to 10,000+ notes without downloading the entire tree on page load. This document describes how to test the implementation.

## Architecture

```
/api/tree (GET)              → Returns root items only
/api/tree/children (GET)     → Returns children of a specific parent
/api/tree/status (GET)       → Returns tree health status
/api/tree (POST)             → Move/mutate items (unchanged)
/api/notes/[id]/share (POST) → Clone note to another user (unchanged)
```

## Testing Scenarios

### Scenario 1: Initial Page Load (Root Items Only)

1. Open browser DevTools → Network tab
2. Navigate to `/notes`
3. Observe in Console:
   - `initTree()` should call `fetch()` which hits `GET /api/tree`
   - Response should be: `{ parentId: "root", items: [{ id, title, isFolder, isExpanded }, ...] }`
   - Should complete in ~100-200ms (network dependent)
   - Left sidebar shows root items immediately

**Expected Result**: Root folders appear in tree within 100-200ms

### Scenario 2: Expand a Folder (Lazy-Load Children)

1. In left sidebar, click arrow icon next to a folder
2. Observe in Console:
   - `loadChildren(folderId)` should be called
   - Makes request: `GET /api/tree/children?parent_id=<id>`
   - Response: `{ parentId: "<id>", items: [...children...] }`
   - Children appear in tree within 50-200ms

**Expected Result**: Children load dynamically without full tree download

### Scenario 3: Expand Nested Folder

1. After Scenario 2, expand a child that is also a folder
2. Same process repeats: `loadChildren(childFolderId)`
3. Each level loads independently

**Expected Result**: Nested folders can be expanded indefinitely with per-folder loading

### Scenario 4: Prevent Duplicate Loads

1. Expand folder A (observe network request)
2. Collapse folder A
3. Expand folder A again
4. Check Network tab: **No new request should be made**
5. Children should appear instantly from tree state cache

**Expected Result**: Children are cached in state after first load; repeated expansions are instant

### Scenario 5: Create Note in Root

1. Use "Create Note" button
2. New note should appear in tree immediately (no API call to children)
3. Note is added to `tree.items` and root's children list locally

**Expected Result**: Local state updates are instant

### Scenario 6: Create Note in Nested Folder

1. Expand nested folder
2. Use context menu → "Create Note" or "Create Folder"
3. New item should appear in expanded folder immediately
4. Verify in `/api/tree/children?parent_id=<id>` it's persisted

**Expected Result**: New items appear locally and are persisted on backend

### Scenario 7: Move Note Between Folders

1. Drag a note from one folder to another
2. Observe `POST /api/tree` with `action: "move"` in Network tab
3. Tree updates locally after successful response
4. Both folders' children lists should reflect the change

**Expected Result**: Drag-and-drop works correctly with lazy-loaded items

### Scenario 8: Share Note (Clone)

1. Right-click note → "Share" (if option exists)
2. Select another user
3. Call `POST /api/notes/:id/share` should succeed
4. Clone appears in target user's tree under their account

**Expected Result**: Sharing creates independent copy with `cloned_from` reference

## API Response Formats

### GET /api/tree (Root)
```json
{
  "parentId": "root",
  "items": [
    {
      "id": "uuid-v7",
      "title": "My Folder",
      "isFolder": true,
      "isExpanded": false
    },
    {
      "id": "uuid-v7",
      "title": "My Note",
      "isFolder": false,
      "isExpanded": false
    }
  ]
}
```

### GET /api/tree/children?parent_id=<uuid>
```json
{
  "parentId": "<uuid>",
  "items": [
    {
      "id": "uuid-v7",
      "title": "Nested Item",
      "isFolder": false,
      "isExpanded": false
    }
  ]
}
```

### POST /api/tree (Move Item)
```json
{
  "action": "move",
  "data": {
    "source": { "parentId": "root", "index": 0 },
    "destination": { "parentId": "<uuid>", "index": 0 }
  }
}
```

Response: `{ "success": true }`

## Debugging

### Check Tree State
In browser console:
```javascript
// Import the store hook
import useNoteTreeStore from '@/lib/notes/state/tree';

// Get current state
const state = useNoteTreeStore.getState();
console.log('Tree items:', state.tree.items);
console.log('Loading children:', state.loadingChildren);
console.log('Init loaded:', state.initLoaded);
```

### Monitor Network Requests
1. Open DevTools → Network tab
2. Filter by Fetch/XHR
3. Look for:
   - `/api/tree` (initial load)
   - `/api/tree/children?parent_id=...` (folder expansion)
   - `/api/tree` POST (mutations like move, rename)

### Check Database
```sql
-- See tree structure for a user
SELECT * FROM app.tree_items WHERE user_id = 'user-uuid' LIMIT 20;

-- See all notes
SELECT * FROM app.notes WHERE user_id = 'user-uuid' LIMIT 20;

-- Check for orphaned notes
SELECT * FROM app.notes WHERE user_id = 'user-uuid' 
  AND note_id NOT IN (SELECT note_id FROM app.tree_items WHERE user_id = 'user-uuid');
```

## Performance Expectations

| Operation | Target Time | Notes |
|-----------|------------|-------|
| Initial page load | < 200ms | Loading root items only |
| Expand folder | 50-200ms | Depends on folder size (10-1000 items) |
| Repeated expand | < 10ms | Instant (cached in state) |
| Create note | < 100ms | Local update + API call |
| Move note | 100-300ms | Local update + API call |
| Drag-and-drop | < 500ms | Including expand animation |

## Known Limitations / Future Work

1. **No full-text search across unloaded folders** - Only searches loaded items in memory
   - Solution: Implement server-side search endpoint
2. **No breadcrumb navigation yet** - Can't jump directly to deep folders
   - Solution: Implement `/api/tree/path/:note_id` endpoint
3. **No infinite scroll** - Each folder loads all children at once
   - Solution: Add offset/limit pagination to `/api/tree/children`

## Rollback Plan

If issues arise:
1. Revert to commit before lazy-loading (full tree loading)
2. Change `initTree()` to call full `/api/tree?full=true` endpoint
3. Remove `loadChildren()` calls from UI

## Related Files

- `src/lib/notes/api/tree.ts` - API client
- `src/lib/notes/state/tree.ts` - Zustand store
- `src/components/notes/sidebar/sidebar-list.tsx` - UI component
- `src/app/api/tree/route.ts` - Server endpoint
- `src/app/api/tree/children/route.ts` - Server endpoint
