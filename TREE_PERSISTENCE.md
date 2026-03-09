# Tree Persistence Architecture

## Overview
Folder expanded/collapsed state is automatically saved to **both IndexedDB (instant) and PostgreSQL (persistent)** storage.

## Storage Layers

### 1. **IndexedDB Cache (oghma-ui database)**
- **Location**: Browser's local IndexedDB under `oghma-ui` database
- **Key**: `tree` (stored as key-value pair in 'data' object store)
- **Speed**: Instant (no network)
- **Purpose**: Provide instant UI responsiveness without waiting for API
- **Expires**: Never (user can clear browser cache/storage)

### 2. **PostgreSQL Database**
- **Table**: `app.tree_items`
- **Column**: `is_expanded` (boolean, default false)
- **Speed**: Network latency (typically 50-500ms)
- **Purpose**: Persistent storage across devices/sessions
- **Scope**: Per-user data (filtered by user_id)

## Persistence Flow

### When User Toggles Folder:
```
User clicks expand/collapse chevron
        ↓
onToggle() callback triggered
        ↓
mutateItem(id, { isExpanded: true/false })
        ↓
┌─── Parallel Operations ───────────────────┐
│                                           │
│ 1. Update in Memory                      │
│    set({ tree: newTree })                │
│                                           │
│ 2. Save to IndexedDB (Instant)           │
│    uiCache.setItem('tree', newTree)      │
│    └─ In oghma-ui database, 'data' store│
│                                           │
│ 3. Send to API (Background)              │
│    POST /api/tree                        │
│    └─ action: 'mutate'                   │
│        └─ id, isExpanded                 │
│                                           │
└───────────────────────────────────────────┘
        ↓
API Handler (src/app/api/tree/route.ts)
        ↓
updateTreeItem(userId, noteId, { isExpanded })
        ↓
UPDATE app.tree_items 
SET is_expanded = $value
WHERE user_id = $userId AND note_id = $noteId
        ↓
✅ Saved to PostgreSQL
```

### On Page Load/Reload:
```
App starts
        ↓
useNoteTreeStore.getState().initTree()
        ↓
1. Try to load from IndexedDB cache (instant)
   const cache = await uiCache.getItem('tree')
   
2. Simultaneously fetch fresh from API
   const apiTree = await treeAPI.fetch()
   
3. getTreeFromPG loads tree with is_expanded
   for each row:
     items[noteId] = {
       id: noteId,
       isExpanded: row.is_expanded ?? false  // ← Loaded here
     }
   
4. Update cache with fresh data
   uiCache.setItem('tree', apiTree)
        ↓
✅ UI shows expanded/collapsed state from PostgreSQL
```

## Key Implementation Details

### File: `src/lib/notes/state/tree.ts`
- **mutateItem (line 234)**: Updates tree in memory, cache, and API
- **setItemsExpandState (line 295)**: Bulk update for collapsing all/expanding parent
- **uiCache.setItem (line 242)**: Persists to IndexedDB

### File: `src/lib/notes/storage/pg-tree.js`
- **getTreeFromPG (line 10)**: Loads is_expanded from database
- **updateTreeItem (line 120)**: Updates is_expanded in PostgreSQL
  - **Fixed**: Uses `note_id` (UUID) not `id` (INTEGER) in WHERE clause

### File: `src/lib/notes/cache/index.ts`
- **createCacheInterface (line 34)**: IndexedDB wrapper
- **uiCache (line 65)**: Instance for UI data storage

### File: `src/components/notes/sidebar/sidebar-list.tsx`
- **onToggle (line 53)**: User clicks expand/collapse → calls mutateItem

## Data Types

### TreeItemModel with isExpanded
```typescript
{
  id: string;              // Note UUID
  children: string[];      // Child note IDs
  isExpanded?: boolean;    // ← The persisted state
  data?: NoteModel;        // Note content (optional)
  hasChildren?: boolean;   // Computed from children.length
}
```

### Database Column
```sql
is_expanded BOOLEAN NOT NULL DEFAULT FALSE
```

## Cache Keys in IndexedDB

### Database: `oghma-ui`
Object store: `data`

| Key | Value | Updated When |
|-----|-------|--------------|
| `tree` | Full TreeModel | Toggle folder, add/move note |
| `editor-mode` | EditorMode | Switch editor mode |
| (other UI state) | ... | ... |

## Troubleshooting

### Tree state not persisting across reload:
1. **Check IndexedDB**: DevTools → Application → IndexedDB → oghma-ui → data
   - Look for key `tree` with isExpanded values
   
2. **Check PostgreSQL**: Run query:
   ```sql
   SELECT note_id, is_expanded 
   FROM app.tree_items 
   WHERE user_id = 'your-user-uuid'
   ORDER BY note_id;
   ```
   
3. **Check for errors**: 
   - Browser console for network errors
   - Server logs for API errors
   - Look for "Failed to sync tree" messages

### Expanded state reverts on reload:
- **Cause**: updateTreeItem might be using wrong column
- **Fix**: Verify WHERE clause uses `note_id` not `id`
- **Status**: ✅ Fixed in commit 5996323

### Tree not loading at all:
- Check if PostgreSQL is accessible (ETIMEDOUT error)
- Verify IndexedDB is enabled in browser
- Check user_id in URL matches authenticated user

## Performance Notes

- **Initial load**: Max 1-2 seconds (API latency + rendering)
- **Toggle speed**: Instant (IndexedDB is <1ms)
- **Sync speed**: Background (doesn't block UI)
- **Storage**: ~5KB per 100 notes (IndexedDB)
- **DB query**: Indexed by user_id, <100ms per user

## Future Improvements

- [ ] Debounce API sync (combine multiple toggles into one request)
- [ ] Offline support (queue API syncs when offline)
- [ ] Automatic cleanup (remove old cache after 30 days)
- [ ] Compression (gzip tree before storing)
