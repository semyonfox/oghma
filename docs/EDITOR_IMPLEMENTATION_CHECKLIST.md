# Editor Redesign: Implementation Checklist

## Phase 1: Core Editor Infrastructure (Week 1)

### Component Refactoring
- [ ] **Split editor component tree**
  - Extract `EditorHeader` component (title, breadcrumb, tags)
  - Extract `EditorToolbar` component (formatting buttons)
  - Extract `EditorStatusBar` component (word count, sync status)
  - Create `EditorSplitView` component (editor + preview)

- [ ] **Reorganize file structure**
  ```
  src/components/editor/
  ├── core/
  │   ├── editor-split-view.tsx
  │   ├── editor-header.tsx
  │   ├── editor-toolbar.tsx
  │   └── editor-status-bar.tsx
  ├── panels/
  │   ├── properties-panel.tsx
  │   ├── backlinks-panel.tsx
  │   └── references-panel.tsx
  ├── plugins/
  │   ├── bidirectional-links.ts
  │   └── tag-plugin.ts
  ├── hooks/
  │   ├── use-editor-stats.ts
  │   ├── use-auto-save.ts
  │   └── use-keyboard-shortcuts.ts
  └── types/
      └── editor.types.ts
  ```

### Feature: Line Numbers & Minimap
- [ ] Add line numbers to editor
  - Toggle visibility via settings
  - Sync with preview scroll
- [ ] Add minimap (right edge of editor)
  - Shows overview of content
  - Click to jump to location
  - Toggle visibility via settings

**Lexical Configuration**:
```tsx
const editorConfig = {
  namespace: 'OghmaNotes',
  theme: {
    paragraph: 'editor-paragraph',
    // Add line number styles
  },
  onError: (error) => console.error(error),
};
```

### Feature: Split View with Scroll Sync
- [ ] Implement editor + preview side-by-side layout
- [ ] Add scroll sync algorithm
  - Calculate scroll percentage in editor
  - Apply proportional scroll to preview
- [ ] Add divider for resizing between panes
- [ ] Save pane sizes to localStorage

**Implementation Reference**:
```tsx
const EditorSplitView = ({ note, onContentChange }) => {
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const [content, setContent] = useState(note.content);
  
  const handleEditorScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const scrollPercent = scrollTop / (scrollHeight - clientHeight);
    
    // Apply to preview
    const preview = previewRef.current;
    const previewScroll = scrollPercent * (preview.scrollHeight - preview.clientHeight);
    preview.scrollTop = previewScroll;
  };
  
  return (
    <div className="flex h-full gap-2">
      <div 
        ref={editorRef}
        className="flex-1 overflow-auto"
        onScroll={handleEditorScroll}
      >
        <Lexical content={content} onChange={setContent} />
      </div>
      <div 
        ref={previewRef}
        className="flex-1 overflow-auto border-l border-gray-600"
      >
        <MarkdownPreview content={content} />
      </div>
    </div>
  );
};
```

### Feature: Status Bar Enhancement
- [ ] Display sync status
  - ✓ Saved (with timestamp)
  - ⟳ Syncing...
  - ⚠️ Offline
  - ✕ Error (with retry button)

- [ ] Display editor statistics
  - Word count (updates on change)
  - Reading time (words / 200)
  - Character count
  - Current line:column

- [ ] Display zoom level
  - Current zoom percentage
  - +/- buttons
  - Cmd++, Cmd+-, Cmd+0 shortcuts

**Hook Implementation**:
```tsx
const useEditorStats = (content) => {
  return useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed.split(/\s+/).length;
    const chars = trimmed.length;
    const readingTime = Math.ceil(words / 200);
    
    return { words, chars, readingTime };
  }, [content]);
};

const useAutoSave = (noteId, content) => {
  const [syncStatus, setSyncStatus] = useState('saved');
  
  useEffect(() => {
    const saveTimer = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        // Save to IndexedDB immediately
        await saveToIndexedDB(noteId, content);
        
        // Sync to server if online
        if (navigator.onLine) {
          await syncToServer(noteId, content);
        }
        
        setSyncStatus('saved');
      } catch (error) {
        setSyncStatus('error');
        console.error('Save error:', error);
      }
    }, 3000);
    
    return () => clearTimeout(saveTimer);
  }, [content, noteId]);
  
  return syncStatus;
};
```

---

## Phase 1: Sidebar & Navigation (Week 1)

### Component: Notes Tree Sidebar
- [ ] Display hierarchical folder/note structure
- [ ] Implement expand/collapse for folders
  - Arrow icon to toggle
  - Smooth animation
  - State persists in localStorage

- [ ] Add context menu (right-click)
  - New Note
  - Rename
  - Move to Folder
  - Duplicate
  - Archive
  - Delete

- [ ] Add drag-and-drop
  - Drag notes between folders
  - Drag folders to reorganize
  - Show drop zone indicator

**Example Component**:
```tsx
const NotesTree = ({ notes, onSelect, onContextMenu }) => {
  const [expanded, setExpanded] = useState(new Set());
  
  const toggleFolder = (folderId) => {
    const next = new Set(expanded);
    next.has(folderId) ? next.delete(folderId) : next.add(folderId);
    setExpanded(next);
  };
  
  return (
    <div className="space-y-1">
      {notes.map((item) => (
        <div key={item.id} className="relative">
          <div
            onContextMenu={(e) => onContextMenu(e, item)}
            onDragStart={(e) => e.dataTransfer.setData('noteId', item.id)}
            onDrop={(e) => handleDrop(e, item.id)}
          >
            {item.type === 'folder' && (
              <button onClick={() => toggleFolder(item.id)}>
                {expanded.has(item.id) ? '▼' : '▶'}
              </button>
            )}
            <span onClick={() => onSelect(item.id)}>{item.name}</span>
          </div>
          
          {item.type === 'folder' && expanded.has(item.id) && (
            <div className="ml-4">
              <NotesTree 
                notes={item.children} 
                onSelect={onSelect}
                onContextMenu={onContextMenu}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

### Component: Search Panel (Cmd+K)
- [ ] Implement command palette
  - Opens with Cmd+K (Windows: Ctrl+K)
  - Closed with Escape
  - Persistent query input

- [ ] Fuzzy search over:
  - Notes (by title + content)
  - Folders
  - Commands (Create Note, Generate Quiz, etc.)
  - Recent items

- [ ] Display results in categories
  - Notes
  - Commands
  - Recent

- [ ] Navigation
  - Arrow Up/Down to select
  - Enter to execute/open
  - Esc to close

**Implementation**:
```tsx
const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  useKeyboardShortcut({
    key: 'k',
    ctrl: true,
    handler: () => setIsOpen(true),
  });
  
  const results = useMemo(() => {
    if (!query) return getRecentItems();
    
    return [
      ...fuzzySearchNotes(query),
      ...fuzzySearchCommands(query),
    ];
  }, [query]);
  
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowUp':
        setSelectedIndex(Math.max(0, selectedIndex - 1));
        break;
      case 'ArrowDown':
        setSelectedIndex(Math.min(results.length - 1, selectedIndex + 1));
        break;
      case 'Enter':
        executeCommand(results[selectedIndex]);
        setIsOpen(false);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full max-w-2xl mx-auto">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command or search notes..."
          className="w-full px-4 py-3 rounded-lg border border-gray-600 bg-gray-800 text-white"
        />
        
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {results.map((result, idx) => (
            <li
              key={result.id}
              className={`px-4 py-2 cursor-pointer ${
                idx === selectedIndex ? 'bg-indigo-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => executeCommand(result)}
            >
              {result.icon} {result.name}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
};
```

### Component: Document Outline
- [ ] Auto-generate from H1-H6 headings
- [ ] Display hierarchical TOC
- [ ] Click to scroll to heading in editor
- [ ] Show current section (highlight)
- [ ] Collapse/expand sections

---

## Phase 1: Editor Features (Week 2)

### Feature: Bidirectional Links
- [ ] Parse `[[Note Title]]` syntax
  - Lexical plugin to detect pattern
  - Validate note exists
  - Render as blue link

- [ ] Create link in database
  - Store relationship (source, target)
  - Handle renames (update links)
  - Handle deletions (mark as unresolved)

- [ ] Display unresolved links
  - Show red text if target doesn't exist
  - Offer to create target note

**Lexical Plugin**:
```tsx
const BacklinksPlugin = () => {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    const unlisten = editor.registerNodeTransform(TextNode, (textNode) => {
      const text = textNode.getTextContent();
      const pattern = /\[\[([^\]]+)\]\]/g;
      let match;
      let offset = 0;
      
      while ((match = pattern.exec(text)) !== null) {
        const [fullMatch, title] = match;
        const start = match.index;
        const end = start + fullMatch.length;
        
        // Replace with link node
        const linkNode = new LinkNode({ title });
        textNode.replace(linkNode);
      }
    });
    
    return unlisten;
  }, [editor]);
  
  return null;
};
```

### Feature: Auto-Save with IndexedDB
- [ ] Initialize IndexedDB on mount
  - Create store for notes
  - Create index by noteId + timestamp

- [ ] Auto-save every 3 seconds (debounced)
  - Save to IndexedDB immediately
  - Show "Saving..." indicator
  - Change to "✓ Saved" on success

- [ ] Sync to server when online
  - Check navigator.onLine
  - POST to `/api/notes/{id}` with etag for conflict detection
  - Show error if sync fails
  - Queue changes if offline

- [ ] Handle conflicts
  - Last-write-wins (for MVP)
  - Show notification to user
  - Future: merge dialog

**Hook**:
```tsx
export const useAutoSave = (noteId, content) => {
  const [syncStatus, setSyncStatus] = useState('saved');
  const contentRef = useRef(content);
  
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      
      try {
        // Save to IndexedDB
        const db = await openDB('oghmaNotes', 1, {
          upgrade(db) {
            db.createObjectStore('notes', { keyPath: 'id' });
          },
        });
        
        await db.put('notes', {
          id: noteId,
          content: contentRef.current,
          timestamp: Date.now(),
        });
        
        // Sync to server if online
        if (navigator.onLine) {
          await fetch(`/api/notes/${noteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: contentRef.current }),
          });
        }
        
        setSyncStatus('saved');
      } catch (error) {
        console.error('Save failed:', error);
        setSyncStatus('error');
      }
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []); // Empty deps - uses ref to avoid recreating
  
  return syncStatus;
};
```

### Feature: Tag Management
- [ ] Add tag input UI in editor header
  - Comma-separated or hashtag syntax
  - Autocomplete suggestions
  - Click tag to filter

- [ ] Store tags in database
  - Link tags to notes (many-to-many)
  - Create tag index for search
  - Support hierarchy: `topic/subtopic`

- [ ] AI Tag Suggestions (optional)
  - Analyze note content
  - Call `/api/notes/{id}/suggest-tags`
  - Display in sidebar with "Accept" button

**Component**:
```tsx
const TagInput = ({ noteId, tags, onChange }) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  
  const handleAddTag = (tag) => {
    const newTags = [...tags, tag.trim().toLowerCase()];
    onChange(newTags);
    setInput('');
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAddTag(input);
    } else if (e.key === ',') {
      e.preventDefault();
      handleAddTag(input);
    }
  };
  
  const handleInputChange = (value) => {
    setInput(value);
    // Fetch suggestions from backend
    if (value.length > 1) {
      fetchTagSuggestions(value).then(setSuggestions);
    }
  };
  
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tags.map((tag) => (
        <span 
          key={tag}
          className="px-2 py-1 bg-indigo-600 rounded text-sm flex items-center gap-2"
        >
          {tag}
          <button 
            onClick={() => onChange(tags.filter(t => t !== tag))}
            className="hover:text-red-400"
          >
            ×
          </button>
        </span>
      ))}
      
      <input
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add tags..."
        className="px-2 py-1 bg-gray-700 rounded text-sm focus:outline-none"
      />
      
      {suggestions.length > 0 && (
        <ul className="absolute bg-gray-800 border border-gray-600 rounded mt-1 w-48 z-10">
          {suggestions.map((tag) => (
            <li
              key={tag}
              onClick={() => handleAddTag(tag)}
              className="px-3 py-2 hover:bg-gray-700 cursor-pointer"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### Feature: Keyboard Shortcuts
- [ ] Implement global keyboard shortcut system
  - Create `useKeyboardShortcut` hook
  - Register shortcuts in editor
  - Display in help modal (Cmd+?)

- [ ] Editor shortcuts
  - Cmd+B = Bold
  - Cmd+I = Italic
  - Cmd+Shift+C = Code block
  - Cmd+] = Increase heading
  - Cmd+[ = Decrease heading

- [ ] Navigation shortcuts
  - Cmd+K = Command palette
  - Cmd+P = Toggle preview
  - Cmd+Shift+E = Focus editor

**Hook**:
```tsx
export const useKeyboardShortcut = (config) => {
  const { key, ctrl = false, shift = false, meta = false, handler } = config;
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = window.navigator.platform.toLowerCase().includes('mac') 
        ? e.metaKey 
        : e.ctrlKey;
      
      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        e.ctrlKey === ctrl &&
        e.shiftKey === shift &&
        isMeta === meta
      ) {
        e.preventDefault();
        handler(e);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, ctrl, shift, meta, handler]);
};
```

---

## Phase 1: Right Panel (Week 2)

### Component: Properties Panel
- [ ] Display metadata
  - Created date
  - Modified date
  - Folder path
  - File size

- [ ] Display tags (interactive)
  - Add/remove tags
  - Click tag to filter

- [ ] Display bidirectional links
  - Links to other notes
  - Backlinks (notes linking here)
  - Click to navigate

**Component**:
```tsx
const PropertiesPanel = ({ note }) => {
  const [tags, setTags] = useState(note.tags || []);
  
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Created</h3>
        <p className="text-sm">{formatDate(note.createdAt)}</p>
      </div>
      
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Modified</h3>
        <p className="text-sm">{formatDate(note.updatedAt)}</p>
      </div>
      
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Folder</h3>
        <p className="text-sm">{note.folder}</p>
      </div>
      
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">Tags</h3>
        <TagInput tags={tags} onChange={setTags} />
      </div>
      
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">
          Links ({note.outgoingLinks?.length || 0})
        </h3>
        <ul className="space-y-1">
          {note.outgoingLinks?.map((link) => (
            <li key={link.id}>
              <a href={`/notes/${link.id}`} className="text-blue-400 hover:underline text-sm">
                → {link.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">
          Backlinks ({note.backlinks?.length || 0})
        </h3>
        <ul className="space-y-1">
          {note.backlinks?.map((link) => (
            <li key={link.id}>
              <a href={`/notes/${link.id}`} className="text-blue-400 hover:underline text-sm">
                ← {link.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
```

### Component: Backlinks Panel
- [ ] Display notes that link to current note
- [ ] Show context (preview of content around link)
- [ ] Click to navigate

---

## Testing & Quality Assurance (Week 2)

### Unit Tests
- [ ] Test `useAutoSave` hook
  - Saves to IndexedDB every 3 seconds
  - Syncs to server when online
  - Shows appropriate status

- [ ] Test `useKeyboardShortcut` hook
  - Registers shortcuts correctly
  - Fires handler on key combination
  - Cleans up on unmount

- [ ] Test bidirectional links parsing
  - Detects `[[...]]` syntax
  - Creates links to valid notes
  - Shows unresolved for non-existent notes

- [ ] Test command palette fuzzy search
  - Filters notes by query
  - Filters commands by query
  - Shows recent items when empty

### Integration Tests
- [ ] Editor split view
  - Scroll sync between panes
  - Content changes in editor reflect in preview

- [ ] Notes tree sidebar
  - Click to open note
  - Context menu works
  - Drag-drop reorganizes

- [ ] Auto-save flow
  - Content saves to IndexedDB
  - Status indicator updates
  - Syncs to server

### E2E Tests
- [ ] Critical user journeys
  - Create note → Add content → Tags → Link to another → Verify backlinks
  - Search for note → Open → Edit → Auto-save → Verify saved

---

## Performance Optimization (Week 2)

### Code Splitting
- [ ] Lazy load Lexical editor
  - Current: 992KB
  - Saves ~500KB on initial page load

### Memoization
- [ ] Memoize expensive components
  - EditorSplitView
  - NotesTree
  - CommandPalette results

### Virtual Scrolling
- [ ] If notes tree is large (>1000 notes)
  - Use `react-window` or `react-virtual`
  - Render only visible items

---

## Phase 2 Features (Not in MVP)

### Knowledge Graph Visualization
- [ ] Install library (react-force-graph)
- [ ] Fetch note links
- [ ] Render 2D/3D graph
- [ ] Click node to navigate
- [ ] Toggle labels, physics

### Advanced Search
- [ ] Filter by:
  - Created date range
  - Modified date range
  - Tags (multiple)
  - Folder
  - Size
  - Type (note, PDF, etc.)

### Document Export
- [ ] Export to PDF
  - Preserve Markdown formatting
  - Include table of contents
  - Include creation metadata

- [ ] Export to HTML
  - Styled version for sharing
  - Self-contained (no external resources)

---

## Sign-Off Checklist

### Developer Checklist
- [ ] All components created and organized
- [ ] Unit tests written (>70% coverage)
- [ ] Integration tests passing
- [ ] No console errors/warnings
- [ ] Code follows project style guide
- [ ] TypeScript types correct
- [ ] Comments added for complex logic

### QA Checklist
- [ ] E2E tests passing
- [ ] Manual testing on Chrome, Firefox, Safari
- [ ] Keyboard navigation working
- [ ] Touch gestures work on tablet
- [ ] Performance targets met (Lighthouse >85)

### Product Checklist
- [ ] All Phase 1 features complete
- [ ] User documentation written
- [ ] Feature walkthrough video created (optional)
- [ ] Stakeholder acceptance

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Page load time | <2s | _____ |
| Auto-save latency | <100ms | _____ |
| Search response | <200ms | _____ |
| Lighthouse score | >85 | _____ |
| Test coverage | >70% | _____ |
| User acceptance | 100% | _____ |

---

**Created**: Feb 17, 2025
**Last Updated**: ___________
**Status**: READY FOR DEVELOPMENT
