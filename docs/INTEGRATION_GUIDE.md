# Editor Redesign: Integration Guide

**For Developers Integrating Phase 1 Components**

---

## Quick Start

This guide explains how to integrate the new editor components with the existing codebase while maintaining compatibility with Notea and S3 storage.

### Created Components Overview

```
NEW HOOKS:
- useAutoSave()        → Auto-save to IndexedDB + S3
- useShortcut()        → Keyboard shortcuts (enhanced)
- useEditorStats()     → Word count, reading time

NEW COMPONENTS:
- EditorHeader         → Title, breadcrumbs, tags, actions
- EditorStatusBar      → Sync status, stats, zoom
- EditorSplitView      → Editor + preview with scroll sync
- CommandPalette       → Cmd+K search
- PropertiesPanel      → Metadata, tags, links
```

**ZERO NEW DEPENDENCIES** - All components use existing packages

---

## Integration Steps

### 1. Import New Components in `src/app/notes/page.tsx`

```tsx
// Add these imports at the top
import { EditorHeader } from '@/components/editor/editor-header';
import { EditorStatusBar } from '@/components/editor/editor-status-bar';
import { CommandPalette } from '@/components/editor/command-palette';
import { PropertiesPanel } from '@/components/editor/panels/properties-panel';
import { useAutoSave } from '@/lib/notes/hooks/use-auto-save';
import { useEditorStats } from '@/lib/notes/hooks/use-editor-stats';
```

### 2. Update the Main Editor Pane (Desktop)

**Before** (current code):
```tsx
<Allotment.Pane>
  <div className="h-full bg-gray-800 flex flex-col overflow-auto">
    {note ? (
      <Editor readOnly={false} />
    ) : (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        {/* empty state */}
      </div>
    )}
  </div>
</Allotment.Pane>
```

**After** (with new components):
```tsx
<Allotment.Pane>
  <div className="h-full bg-gray-800 flex flex-col overflow-hidden">
    {/* NEW: Editor header with title, tags, actions */}
    {note && (
      <EditorHeader
        note={note}
        breadcrumbs={["CS101", "Week 5", "Algorithms"]}
        tags={note.tags || []}
        onTitleChange={(title) => {
          // Update note title in store/API
          console.log('Title changed:', title);
        }}
        onTagsChange={(tags) => {
          // Update tags
          console.log('Tags changed:', tags);
        }}
        onAction={(action) => {
          // Handle share, export, delete, etc.
          console.log('Action:', action);
        }}
      />
    )}
    
    {/* Main editor area */}
    <div className="flex-1 overflow-hidden">
      {note ? (
        <Editor readOnly={false} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          {/* empty state */}
        </div>
      )}
    </div>

    {/* NEW: Status bar */}
    {note && (
      <EditorStatusBar
        content={note.content || ''}
        syncStatus={autoSaveStatus.status}
        lastSaved={autoSaveStatus.lastSaved}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        zoom={zoom}
        onZoomChange={setZoom}
      />
    )}
  </div>
</Allotment.Pane>
```

### 3. Add Auto-Save Hook

In the `NotesUI` function, add auto-save:

```tsx
function NotesUI() {
    const { note } = NoteState.useContainer();
    const [zoom, setZoom] = useState(100);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    
    // NEW: Auto-save hook
    const autoSaveStatus = useAutoSave(
      note?.id,
      note?.content || ''
    );
    
    // NEW: Editor stats
    const stats = useEditorStats(note?.content || '');
    
    // Rest of component...
}
```

### 4. Update Right Panel

**Before**:
```tsx
<Allotment.Pane minSize={0} maxSize={400} snap>
  <AIPanel note={note} />
</Allotment.Pane>
```

**After** (with tab switching):
```tsx
const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'ai' | 'chat'>('properties');

<Allotment.Pane minSize={0} maxSize={400} snap>
  <div className="h-full flex flex-col">
    {/* Tab buttons */}
    <div className="flex border-b border-gray-700 bg-gray-800">
      <button
        onClick={() => setRightPanelTab('properties')}
        className={`flex-1 px-3 py-2 text-xs font-medium ${
          rightPanelTab === 'properties'
            ? 'border-b-2 border-indigo-500 text-white'
            : 'text-gray-400 hover:text-gray-300'
        }`}
      >
        Properties
      </button>
      <button
        onClick={() => setRightPanelTab('ai')}
        className={`flex-1 px-3 py-2 text-xs font-medium ${
          rightPanelTab === 'ai'
            ? 'border-b-2 border-indigo-500 text-white'
            : 'text-gray-400 hover:text-gray-300'
        }`}
      >
        AI Chat
      </button>
    </div>
    
    {/* Tab content */}
    <div className="flex-1 overflow-hidden">
      {rightPanelTab === 'properties' ? (
        <PropertiesPanel
          note={note}
          tags={note?.tags || []}
          onTagsChange={(tags) => {
            // Update tags
          }}
          backlinks={backlinks}
          outgoingLinks={outgoingLinks}
        />
      ) : (
        <AIPanel note={note} />
      )}
    </div>
  </div>
</Allotment.Pane>
```

### 5. Add Command Palette at Root

At the top level of `NotesUI()`:

```tsx
const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

return (
  <>
    {/* Existing layout... */}
    <div className="flex flex-col h-screen bg-gray-900">
      {/* navbar, allotment, etc. */}
    </div>
    
    {/* NEW: Command palette at root */}
    <CommandPalette
      isOpen={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      notes={allNotesForSearch}
      onNoteSelect={(noteId) => {
        // Navigate to note
        router.push(`/notes/${noteId}`);
      }}
    />
  </>
);
```

---

## Hook Integration Details

### useAutoSave Hook

**Usage**:
```tsx
const autoSaveStatus = useAutoSave(noteId, content);

// Returns:
// {
//   status: 'saved' | 'saving' | 'offline' | 'error',
//   lastSaved?: Date,
//   error?: string,
//   saveNow: () => Promise<void>
// }
```

**How it works**:
1. Debounces save to 3 seconds after last change
2. Saves to IndexedDB immediately (offline-first)
3. Syncs to server via PUT `/api/notes/{id}` when online
4. Updates status indicator in real-time
5. Handles offline → online transitions automatically

**Important**: The hook uses the existing `useFetcher()` to make API calls, so S3 integration continues to work as before.

### useEditorStats Hook

**Usage**:
```tsx
const stats = useEditorStats(content);

// Returns:
// {
//   wordCount: number,
//   charCount: number,
//   readingTime: number (in minutes),
//   lineCount: number,
//   codeBlockCount: number,
//   linkCount: number
// }
```

---

## Keyboard Shortcuts

### Built-in Shortcuts (Always Active)

| Key | Action |
|-----|--------|
| Cmd+K / Ctrl+K | Open command palette |
| Cmd+S / Ctrl+S | Save (from existing hook) |

### Future Shortcuts (To Implement)

| Key | Action |
|-----|--------|
| Cmd+B / Ctrl+B | Bold |
| Cmd+I / Ctrl+I | Italic |
| Cmd+P / Ctrl+P | Toggle preview |

---

## State Management

### Keep Using Existing Stores

The new components are designed to work with existing state:

```tsx
// useEditorStore - continues to work as before
const { note, onEditorChange, saveNow } = useEditorStore();

// NoteState - continues to work as before
const { note, fetchNote } = NoteState.useContainer();

// UIState - continues to work as before
const { split, settings } = UIState.useContainer();
```

### No Breaking Changes

All new components accept props, no direct state mutations. This keeps the architecture clean and testable.

---

## API Endpoint Integration

### Existing Endpoints (Still Used)

- `PUT /api/notes/{id}` - Update note content (called by useAutoSave)
- `GET /api/notes/{id}` - Fetch note
- `POST /api/notes` - Create note
- `DELETE /api/notes/{id}` - Delete note

### useAutoSave Integration

The hook calls your existing `PUT /api/notes/{id}` endpoint:

```typescript
// In useAutoSave hook:
const response = await request(
  {
    method: 'PUT',
    url: `/api/notes/${id}`,
  },
  { content: text }  // Payload
);
```

Make sure your API endpoint returns the updated note, or at least a success status.

---

## S3 Storage Compatibility

### How It's Maintained

1. **Auto-save** saves to IndexedDB immediately (no S3 in the debounce)
2. **Sync** happens separately via your existing API endpoint
3. **API endpoint** (`PUT /api/notes/{id}`) handles S3 upload internally
4. **No changes needed** to S3 logic

### Flow Diagram

```
User types
    ↓
Editor state updates
    ↓
Content stored in Ref
    ↓
3-second debounce
    ↓
Save to IndexedDB ← (immediate, offline support)
    ↓
IF online: PUT /api/notes/{id} ← (your existing endpoint)
    ↓
Your endpoint handles S3 upload (unchanged)
```

---

## Testing Integration

### Test Checklist

```
- [ ] Page loads without errors
- [ ] Editor header appears with note title
- [ ] Typing updates word count in status bar
- [ ] Cmd+K opens command palette
- [ ] Command palette search works
- [ ] Clicking note in palette navigates correctly
- [ ] Status bar shows "Saving..." then "Saved"
- [ ] Offline indicator appears when offline
- [ ] Tags input works
- [ ] Properties panel shows metadata
- [ ] Zoom controls change editor size
- [ ] Keyboard shortcuts work (test a few)
```

### Manual Testing Flow

1. Create a new note
2. Type some content
3. Watch word count update
4. Wait 3 seconds - should see "Saving..." → "Saved"
5. Toggle browser offline mode (DevTools)
6. Type more content
7. See "Offline" status
8. Toggle online again
9. Should auto-sync
10. Open command palette (Cmd+K)
11. Search for notes
12. Click a note to navigate

---

## Common Issues & Solutions

### "Save button not working"
- Make sure `PUT /api/notes/{id}` endpoint exists
- Check that endpoint returns success (200 or 204)
- Look at console for error messages

### "Command palette not opening"
- Verify `useShortcut` hook is properly imported
- Check browser console for KeyboardEvent errors
- Make sure component is mounted before trying Cmd+K

### "Zoom not working"
- Verify `onZoomChange` prop is passed to StatusBar
- Check that zoom state is managed in parent

### "Auto-save not working"
- Check IndexedDB in DevTools > Application > IndexedDB
- Look for console errors from `useFetcher()`
- Verify `/api/notes/{id}` endpoint is reachable

---

## Next Phase (Phase 2)

After Phase 1 is integrated and tested:

1. **Bidirectional Links** - Add Lexical plugin for `[[...]]` syntax
2. **Backlinks Panel** - Show notes linking to current note
3. **Document Outline** - TOC auto-generated from headings
4. **AI Chat Panel** - Context-aware suggestions
5. **Enhanced Sidebar** - Better note tree organization

---

## Support & Questions

For questions about integration:

1. Check this guide first
2. Review the component source code (comments included)
3. Look at `EDITOR_REDESIGN.md` for design details
4. Check `IMPLEMENTATION_PROGRESS.md` for status

---

**Version**: 1.0
**Last Updated**: Feb 17, 2025
**Status**: ACTIVE
