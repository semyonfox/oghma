# Markdown Editor Redesign Specification

## Executive Summary

The OghmaNotes markdown editor requires a comprehensive redesign to align with modern patterns from Obsidian and VSCode. This document specifies the new architecture, UI/UX patterns, and implementation guidelines to create an optimal, feature-rich editor experience for university students.

**Severity**: CRITICAL - Current editor lacks essential features for productive note-taking
**Timeline**: Phase 1 (2-3 weeks) + Phase 2 (1-2 weeks)
**Impact**: Core user experience, productivity, knowledge management

---

## 1. Design Philosophy

### 1.1 Core Principles

1. **Distraction-Free Focus**: Clean, minimal UI with optional expanded views
2. **Keyboard-First**: Power users can accomplish most tasks via keyboard
3. **Discoverability**: Visual cues guide new users; advanced features remain accessible
4. **Performance**: Instant response time (<50ms) for all interactions
5. **Accessibility**: Full keyboard navigation, semantic HTML, screen reader support
6. **Extensibility**: Plugin architecture for future enhancements (backlinks, templates, etc.)

### 1.2 Target User Personas

- **Primary**: University students (18-25) familiar with Notion/OneNote
- **Secondary**: Study group leaders who collaborate via shared notes
- **Power Users**: Students who use Obsidian/Roam Research-style workflows

---

## 2. Architecture Overview

### 2.1 Component Hierarchy

```
NotesPage
├── NavigationSidebar (fixed, icon-only)
│   ├── Nav Items (Notes, Documents, Chat, Flashcards, Calendar, Analytics)
│   └── Avatar + Settings Menu
│
├── WorkspaceSidebar (resizable)
│   ├── Tabs (Notes Tree, Search, Outline)
│   ├── Notes Tree View
│   │   ├── Favorite Folders
│   │   ├── Recently Modified
│   │   ├── Folder Hierarchy
│   │   └── Context Menus
│   ├── Search Panel
│   │   ├── Quick Search (Cmd+K)
│   │   ├── Advanced Search Filters
│   │   └── Search Results
│   └── Document Outline
│       ├── H1-H6 Hierarchy
│       └── Click to Navigate
│
├── MainEditor (center, resizable)
│   ├── EditorHeader
│   │   ├── Breadcrumb Navigation
│   │   ├── Document Title (editable)
│   │   ├── Metadata Tags
│   │   └── Action Buttons (Share, More)
│   │
│   ├── SplitView
│   │   ├── EditorPane (left)
│   │   │   ├── Minimap (optional)
│   │   │   ├── Line Numbers
│   │   │   ├── Editor (Lexical)
│   │   │   └── Breadcrumb
│   │   │
│   │   └── PreviewPane (right, toggleable)
│   │       ├── Live Preview
│   │       ├── TOC (auto-generated)
│   │       └── Backlinks Panel
│   │
│   └── StatusBar
│       ├── Sync Status
│       ├── Word Count / Reading Time
│       ├── Line:Column
│       └── Zoom Level
│
├── RightPanel (toggleable, resizable)
│   ├── Properties Panel (default)
│   │   ├── Created Date
│   │   ├── Modified Date
│   │   ├── Tags
│   │   ├── Links (outgoing/incoming)
│   │   └── AI Suggestions
│   │
│   ├── AI Chat Panel (toggle)
│   │   ├── Context-aware suggestions
│   │   └── Chat history
│   │
│   └── References Panel (toggle)
│       ├── Backlinks (notes linking here)
│       └── Related notes (semantic)
│
└── StatusBar (bottom)
    └── Connection, Notification Indicators
```

### 2.2 State Management Architecture

```
EditorState (Zustand)
├── document: NoteModel
├── isDirty: boolean
├── isSaving: boolean
├── lastSaved: Date
├── cursorPosition: { line, column }
├── selection: { start, end }
└── history: Change[]

UIState (Context)
├── split: { sizes: [number, number] }
├── rightPanelOpen: boolean
├── rightPanelTab: 'properties' | 'chat' | 'references'
├── leftSidebarOpen: boolean
├── leftSidebarTab: 'notes' | 'search' | 'outline'
├── isFullscreen: boolean
├── zoom: number
└── theme: 'dark' | 'system'

SearchState (Zustand)
├── query: string
├── filters: SearchFilters
├── results: SearchResult[]
├── isSearching: boolean
└── selectedIndex: number

NavigationState (Zustand)
├── currentNoteId: string | null
├── breadcrumbs: BreadcrumbItem[]
├── recentNotes: NoteModel[]
└── favoriteFolders: string[]
```

---

## 3. UI/UX Redesign

### 3.1 Layout Grid System

The editor uses a 4-pane layout with flexible sizing:

```
[Icon Nav | Left Sidebar | Main Editor | Right Panel]
56px      | 200-600px    | Flex        | 0-400px
```

**Resizing**: Panes are resizable via Allotment; sizes persist in localStorage

**Mobile**: On tablets (<1024px), collapse right panel and reduce left sidebar max-width

### 3.2 Left Sidebar: Enhanced Navigation

#### 3.2.1 Notes Tree View

**Features**:
- Hierarchical folder/note display with expand/collapse
- Favorite folders (pinned to top)
- Recently modified section
- Drag-and-drop to organize
- Right-click context menus (rename, move, delete, duplicate)
- Search-to-filter

**Visual Design**:
```
┌────────────────────────────┐
│ 🔍 Filter notes...         │
├────────────────────────────┤
│ ⭐ Favorites               │
│   └─ CS101 - Algorithms    │
│   └─ CT216 - Final Year    │
├────────────────────────────┤
│ 🕐 Recent                  │
│   • 2min ago: Week 5 Notes │
│   • 1h ago: Problem Set    │
├────────────────────────────┤
│ 📁 All Notes               │
│   ├─ 🎓 CS101              │
│   │  ├─ Week 1             │
│   │  ├─ Week 2             │
│   │  └─ Exam Prep          │
│   ├─ 📊 CT216              │
│   │  ├─ Lecture 1          │
│   │  ├─ Lecture 2          │
│   │  └─ Project Notes      │
│   └─ 🧪 Labs               │
└────────────────────────────┘
```

**Interactions**:
- Click: Open note
- Cmd+Click: Open in split view (future)
- Right-click: Context menu (New Note, Rename, Move, Archive, Delete)
- Drag-drop: Reorder notes/folders
- Double-click folder: Collapse/expand
- Filter input: Real-time search

#### 3.2.2 Search Panel

**Tab: "Search"** (activated via Cmd+P or sidebar tab)

```
┌────────────────────────────┐
│ 🔍 Search notes...         │
├────────────────────────────┤
│ Advanced Filters:          │
│ ☐ In current folder only   │
│ ☐ Tags: [____] [____]      │
│ ☐ Modified: [Last 7 days]  │
│ ☐ Type: Notes ☐ PDFs       │
├────────────────────────────┤
│ Results (12 found):        │
│                            │
│ > Week 5 - Algorithms      │
│   ...semantic search found │
│   in Week 4 PDF...         │
│   📄 CT216/Algorithms      │
│                            │
│ > Binary Search Trees      │
│   ...time complexity of... │
│   📝 CS101/Week 5          │
└────────────────────────────┘
```

**Search Modes** (toggleable buttons):
- **Keyword** (default): Fast, exact term matching
- **Semantic**: Meaning-based using embeddings
- **Hybrid**: Both combined (default for premium)

#### 3.2.3 Document Outline (TOC)

**Tab: "Outline"** (auto-generated from H1-H6 headings)

```
┌────────────────────────────┐
│ Outline                    │
├────────────────────────────┤
│ 📄 Week 5: Algorithms      │
│  ├─ 1. Introduction        │
│  ├─ 2. Time Complexity     │
│  │  ├─ 2.1 Big O Notation  │
│  │  └─ 2.2 Examples        │
│  ├─ 3. Search Algorithms   │
│  │  ├─ 3.1 Linear Search   │
│  │  └─ 3.2 Binary Search   │
│  └─ 4. Conclusion          │
│                            │
│ Click to jump              │
└────────────────────────────┘
```

**Features**:
- Click heading to jump to location
- Auto-scroll current section
- Color-coded by level (H1 bold, H2 regular, H3 italic)
- Collapse/expand subtopics

### 3.3 Main Editor Pane

#### 3.3.1 Editor Header

```
┌─────────────────────────────────────────────────────────────┐
│ CS101 / Week 5 / Algorithms          [Tag] [Tag]  ⋮         │
│ 📝 Untitled Note                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components**:
- **Breadcrumb**: Clickable path to current note (CS101 > Week 5 > Algorithms)
- **Title**: Editable, auto-saves on blur
- **Metadata Tags**: Editable tags, type to add (#tag syntax also works)
- **Action Menu** (⋮):
  - Share Note
  - Export to PDF
  - Duplicate
  - Archive
  - Delete
  - Properties

#### 3.3.2 Editor + Preview Split View

**Editor (Left)**:
- Lexical-based editor with:
  - Line numbers (toggleable)
  - Syntax highlighting
  - Bracket matching
  - Auto-indent
  - Code folding (for code blocks)
  - Minimap on right edge (optional)

**Preview (Right)**:
- Live Markdown rendering
- Syntax-highlighted code blocks
- Rendered tables
- LaTeX math: `$...$` (inline) or `$$...$$` (block)
- Embeds: `![alt](url)` renders as images
- Links: `[[Note Title]]` renders as backlinks (blue, clickable)

**Interactions**:
- Scroll sync: Scrolling in editor scrolls preview proportionally
- Click in preview: Jump to source in editor
- Split divider: Draggable to resize

#### 3.3.3 Markdown Toolbar (Optional)

Toggled via settings. Appears above editor:

```
┌──────────────────────────────────────────────────┐
│ B  I  U  S  |  H1 H2 H3  |  [] {} <>  |  ⚙️      │
└──────────────────────────────────────────────────┘
```

**Buttons**:
- **B**: Bold (`**text**`)
- **I**: Italic (`*text*`)
- **U**: Underline (`__text__`)
- **S**: Strikethrough (`~~text~~`)
- **H1-H3**: Heading levels
- **[]**: Unordered list
- **{}**: Ordered list
- **<>**: Code block
- **⚙️**: More formatting (table, quote, etc.)

**Keyboard Shortcuts** (always available):
- `Cmd+B`: Bold
- `Cmd+I`: Italic
- `Cmd+Shift+C`: Code block
- `Cmd+Shift+>`: Quote
- `Tab`: Indent
- `Shift+Tab`: Outdent

### 3.4 Right Panel

#### 3.4.1 Properties Panel (Default)

```
┌───────────────────────┐
│ Properties            │
├───────────────────────┤
│ Created: Jan 15, 2024 │
│ Modified: Now         │
│ Folder: CS101/Week-5  │
│                       │
│ Tags:                 │
│ [algorithm] [sort]    │
│ [exam-prep]           │
│ + Add tag...          │
│                       │
│ Links:                │
│ → Binary Search       │
│ → Sorting Algorithms  │
│ ← Linked from Week 4  │
│                       │
│ AI Suggestions:       │
│ 💡 Add more examples  │
│ 💡 Link to Big O      │
└───────────────────────┘
```

**Sections**:
- **Metadata**: Created, modified, folder path
- **Tags**: Interactive, addable, removable
- **Links**: Bidirectional (outgoing and incoming)
- **AI Suggestions** (optional): Smart suggestions based on content

#### 3.4.2 AI Chat Panel (Toggle)

```
┌───────────────────────────────┐
│ Ask AI                        │
├───────────────────────────────┤
│ [Chat History Button]         │
├───────────────────────────────┤
│ This note is about algorithms │
│ Want to:                      │
│ • Generate quiz              │
│ • Create flashcards          │
│ • Find related topics         │
│ • Summarize                   │
│                               │
│ Message input...              │
│ [Send] [Clear]                │
└───────────────────────────────┘
```

#### 3.4.3 References Panel (Toggle)

```
┌───────────────────────────────┐
│ References                    │
├───────────────────────────────┤
│ Backlinks (4 notes link here) │
│ • Week 4 - Sorting            │
│ • Final Exam Prep             │
│ • Big O Notation              │
│ • Project Assignment          │
│                               │
│ Related Topics (AI-found)     │
│ • Time Complexity             │
│ • Data Structures             │
│ • Recursion                   │
└───────────────────────────────┘
```

### 3.5 Status Bar (Bottom)

```
┌────────────────────────────────────────────────────────┐
│ ✓ Saved (1min ago)  │ 342 words  │ Ln 42, Col 18  │ 100% │
└────────────────────────────────────────────────────────┘
```

**Sections**:
- **Sync Status**: ✓ Saved, ⟳ Syncing, ⚠️ Offline, ✕ Error
- **Word Count**: Dynamically updated
- **Cursor Position**: Line number, column number
- **Zoom Level**: Adjustable via Cmd+Scroll or button

---

## 4. Feature Specifications

### 4.1 Split View (Markdown + Preview)

**Current State**: Implemented but needs refinement

**Enhancements**:
- [ ] Scroll sync (preview scrolls with editor)
- [ ] Click in preview jumps to source
- [ ] Optional side-by-side (vs current stacked)
- [ ] Toggle preview visibility (Cmd+P)
- [ ] Preview-only mode for reading

**Implementation**:
```tsx
// Editor split view with synced scrolling
const EditorSplitView = () => {
  const [scrollPercentage, setScrollPercentage] = useState(0);
  
  // Sync scroll between editor and preview
  const handleEditorScroll = (offset, height) => {
    setScrollPercentage(offset / (height - viewportHeight));
  };
  
  const handlePreviewScroll = (offset) => {
    // Proportionally scroll editor
  };
  
  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 overflow-auto" onScroll={handleEditorScroll}>
        {/* Lexical Editor */}
      </div>
      <div className="flex-1 overflow-auto" onScroll={handlePreviewScroll}>
        {/* Markdown Preview */}
      </div>
    </div>
  );
};
```

### 4.2 Bidirectional Links & Backlinks

**Features**:
- [ ] Wiki-style syntax: `[[Note Title]]` creates links
- [ ] Backlinks panel shows notes linking to current
- [ ] Click link to navigate
- [ ] Hover preview (tooltip showing first 100 chars)
- [ ] Unresolved links styled differently (red text)

**Implementation**:
```tsx
// Lexical plugin for link detection
const BacklinksPlugin = () => {
  // Parse [[...]] syntax
  // Create links to referenced notes
  // Store relationship in DB
};

// Backlinks panel
const BacklinksPanel = ({ noteId }) => {
  const backlinks = useQuery(['backlinks', noteId], () => 
    fetchBacklinks(noteId)
  );
  
  return (
    <div>
      <h3>Linked from {backlinks.length} notes</h3>
      {backlinks.map(link => (
        <LinkItem key={link.id} link={link} />
      ))}
    </div>
  );
};
```

### 4.3 Auto-Save & Conflict Resolution

**Behavior**:
- Auto-save to IndexedDB every 3 seconds (while typing)
- Sync to S3 every 30 seconds (when online)
- Show saving indicator ("Saving..." → "✓ Saved")

**Conflict Resolution**:
- Last-write-wins (simple, MVP)
- Future: Show conflict dialog with merge options

**Implementation**:
```tsx
// Auto-save with debounce
useEffect(() => {
  const timer = setTimeout(() => {
    // Save to IndexedDB immediately
    saveToIndexedDB(content);
    
    // Sync to server (if online)
    if (isOnline) {
      syncToServer(content).catch(err => {
        showNotification('Sync failed', 'error');
      });
    }
  }, 3000);
  
  return () => clearTimeout(timer);
}, [content]);
```

### 4.4 Command Palette (Cmd+K)

**Behavior**:
- Open with Cmd+K or Ctrl+K
- Fuzzy search over:
  - Notes
  - Folders
  - Commands (Create Note, Generate Quiz, etc.)
  - Recent items
- Navigate with Arrow keys, Enter to select, Esc to close

**Implementation**:
```tsx
const CommandPalette = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  useKeyboardShortcut('Cmd+K', () => setIsOpen(true));
  
  const results = useMemo(() => {
    if (!query) return [...recentItems];
    
    return [
      ...fuzzySearch(notes, query),
      ...fuzzySearch(commands, query),
      ...fuzzySearch(folders, query),
    ];
  }, [query]);
  
  return (
    <Dialog open={isOpen}>
      <input 
        autoFocus 
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search notes or commands..."
      />
      <CommandList results={results} />
    </Dialog>
  );
};
```

### 4.5 Knowledge Graph Visualization

**Features** (Nice-to-Have):
- [ ] Visual graph showing note connections
- [ ] Nodes = notes, edges = links
- [ ] Click node to navigate
- [ ] Filter by tags/module
- [ ] 3D view (optional)

**Libraries**:
- `react-force-graph` (2D/3D)
- `cytoscape` (advanced layouts)
- `vis.js` (lightweight)

### 4.6 Tag Management

**Features**:
- [ ] Add/remove tags from notes
- [ ] Autocomplete suggestions
- [ ] Filter notes by tag
- [ ] Hierarchy: `topic/subtopic` syntax
- [ ] AI-suggested tags

**Implementation**:
```tsx
const TagInput = ({ note, onTagsChange }) => {
  const [tags, setTags] = useState(note.tags || []);
  const [suggestion, setSuggestion] = useState(null);
  
  // AI suggestion on blur
  const handleBlur = async () => {
    const suggested = await fetchAISuggestedTags(note.content);
    setSuggestion(suggested);
  };
  
  return (
    <div>
      <input
        value={tags.join(', ')}
        onChange={e => setTags(e.target.value.split(',').map(t => t.trim()))}
        onBlur={handleBlur}
        placeholder="Add tags... (comma-separated)"
      />
      {suggestion && (
        <div>
          <p>Suggested: {suggestion.map(t => t.name).join(', ')}</p>
          <button onClick={() => setTags([...tags, ...suggestion])}>
            Add Suggestions
          </button>
        </div>
      )}
    </div>
  );
};
```

### 4.7 Reading Time & Statistics

**Display in Status Bar**:
- Word count
- Reading time (avg 200 words/min)
- Character count
- Code block count
- Link count

**Implementation**:
```tsx
const useEditorStats = (content) => {
  return useMemo(() => {
    const words = content.trim().split(/\s+/).length;
    const readingTime = Math.ceil(words / 200);
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    const links = (content.match(/\[\[.*?\]\]/g) || []).length;
    
    return { words, readingTime, codeBlocks, links };
  }, [content]);
};
```

---

## 5. Keyboard Shortcuts

### 5.1 Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+S` | Save (explicit; auto-save handles most cases) |
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+Shift+C` | Code block |
| `Cmd+Shift+>` | Quote |
| `Cmd+Shift+L` | Unordered list |
| `Cmd+Shift+1` | Ordered list |
| `Tab` | Indent / Autocomplete |
| `Shift+Tab` | Outdent |
| `Cmd+/` | Toggle comment |
| `Cmd+]` | Increase heading level |
| `Cmd+[` | Decrease heading level |

### 5.2 Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+P` | Toggle preview |
| `Cmd+Shift+E` | Focus editor |
| `Cmd+Shift+N` | New note |
| `Cmd+Shift+D` | Duplicate note |
| `Cmd+Shift+R` | Rename note |
| `Cmd+Shift+T` | Open last closed note |
| `Arrow Keys` | Navigate sidebar (when focused) |
| `Enter` | Open selected note |

### 5.3 UI Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+,` | Open settings |
| `Cmd+\` | Toggle right panel |
| `Cmd+Shift+\` | Toggle left sidebar |
| `Cmd++` | Zoom in |
| `Cmd+-` | Zoom out |
| `Cmd+0` | Reset zoom |

---

## 6. Implementation Roadmap

### Phase 1: Core Editor Improvements (Weeks 1-2)

**Priority**: Must Have

- [ ] Refactor editor component tree (split into smaller components)
- [ ] Implement split view with scroll sync
- [ ] Add line numbers + minimap
- [ ] Implement auto-save with indicator
- [ ] Add bidirectional links (parsing + display)
- [ ] Implement backlinks panel
- [ ] Add tag management UI
- [ ] Implement command palette (Cmd+K)
- [ ] Add keyboard shortcuts
- [ ] Enhance status bar (word count, reading time)

**Files to Create/Modify**:
```
src/components/editor/
├── editor-split-view.tsx (NEW)
├── editor-header.tsx (NEW)
├── editor-toolbar.tsx (ENHANCE)
├── editor-status-bar.tsx (ENHANCE)
├── plugins/
│   ├── bidirectional-links.ts (NEW)
│   └── tag-plugin.ts (NEW)
├── panels/
│   ├── properties-panel.tsx (NEW)
│   ├── backlinks-panel.tsx (NEW)
│   └── references-panel.tsx (NEW)
└── hooks/
    ├── use-editor-stats.ts (NEW)
    ├── use-auto-save.ts (NEW)
    └── use-keyboard-shortcuts.ts (ENHANCE)
```

### Phase 2: Advanced Features (Weeks 3-4)

**Priority**: Should Have

- [ ] Knowledge graph visualization
- [ ] Advanced search with filters
- [ ] Document outline (TOC) with navigation
- [ ] Hover preview for links
- [ ] Drag-and-drop note reorganization
- [ ] Note templates
- [ ] Custom CSS for preview
- [ ] Export to PDF with formatting preserved

**Files to Create**:
```
src/components/
├── knowledge-graph/
│   ├── graph-visualization.tsx (NEW)
│   └── graph-controls.tsx (NEW)
├── search/
│   ├── advanced-search.tsx (NEW)
│   └── search-filters.tsx (NEW)
└── sidebar/
    └── document-outline.tsx (NEW)
```

### Phase 3: Polish & Optimization (Week 5)

**Priority**: Nice to Have

- [ ] Animations (smooth transitions, focus effects)
- [ ] Accessibility audit + fixes
- [ ] Performance optimization (lazy load components)
- [ ] Dark/light theme support
- [ ] Collaborative editing skeleton (for future)

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Coverage**: 70%+ for core editor logic

```tsx
// Test bidirectional links parsing
describe('BacklinksPlugin', () => {
  it('should parse [[Note Title]] syntax', () => {
    const content = 'This links to [[Algorithms]]';
    const links = parseLinks(content);
    expect(links).toEqual([{ title: 'Algorithms', type: 'backlink' }]);
  });
});

// Test auto-save
describe('useAutoSave', () => {
  it('should save to IndexedDB every 3 seconds', async () => {
    const { result } = renderHook(() => useAutoSave('test-note', content));
    
    await waitFor(() => {
      expect(saveToIndexedDB).toHaveBeenCalled();
    }, { timeout: 3500 });
  });
});

// Test command palette
describe('CommandPalette', () => {
  it('should filter commands by query', () => {
    const { getByPlaceholderText } = render(<CommandPalette />);
    const input = getByPlaceholderText('Search...');
    
    fireEvent.change(input, { target: { value: 'create' } });
    expect(screen.getByText('Create Note')).toBeInTheDocument();
  });
});
```

### 7.2 Integration Tests

- Test note save/sync flow
- Test link creation and resolution
- Test search across notes
- Test sidebar organization

### 7.3 E2E Tests

```gherkin
Feature: Markdown Editor
  Scenario: Create and edit a note
    Given I am on the notes page
    When I click "New Note"
    And I type "Test Note" as title
    And I type "# Heading" in the editor
    Then I should see "Heading" in the preview pane
    And The note should auto-save

  Scenario: Create bidirectional link
    Given I have two notes: "Algorithms" and "Sorting"
    When I open "Sorting" note
    And I type "[[Algorithms]]"
    Then "Algorithms" should show as blue link
    And "Sorting" should appear in "Algorithms" backlinks
```

---

## 8. Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Editor load time | <500ms | 800ms |
| Auto-save latency | <100ms | 500ms |
| Search response | <200ms | 1500ms |
| Scroll smoothness | 60 FPS | 45 FPS |
| Memory footprint | <50MB | 120MB |

**Optimization Techniques**:
- Code splitting for editor (Lexical is 992KB!)
- Virtual scrolling for large note lists
- Memoization for expensive computations
- IndexedDB for offline caching

---

## 9. Accessibility Requirements

### 9.1 WCAG 2.1 Level AA

- [ ] Keyboard navigation for all features
- [ ] Semantic HTML structure
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] ARIA labels for icons
- [ ] Focus indicators visible
- [ ] Screen reader testing (NVDA, VoiceOver)

### 9.2 Testing

```tsx
// Test keyboard navigation
describe('Editor Accessibility', () => {
  it('should navigate sidebar with arrow keys', () => {
    render(<Sidebar />);
    const firstItem = screen.getByRole('treeitem');
    
    fireEvent.focus(firstItem);
    fireEvent.keyDown(firstItem, { key: 'ArrowDown' });
    
    expect(screen.getByRole('treeitem')[1]).toHaveFocus();
  });
});
```

---

## 10. Migration Guide

### 10.1 For Existing Users

1. **Data Preservation**: No data loss; existing notes migrate automatically
2. **UI Introduction**: Welcome overlay on first load explaining new features
3. **Keyboard Shortcuts**: Help modal (Cmd+?) listing all shortcuts
4. **Gradual Rollout**: Feature flags for phased deployment

### 10.2 For Developers

1. **Folder Structure**: Reorganize components into logical groups
2. **State Management**: Migrate from Redux (if used) to Zustand
3. **API Contracts**: OpenAPI spec for backend integration
4. **Testing**: Set up Vitest + React Testing Library

---

## 11. Appendix: Design Resources

### 11.1 Inspiration Sources

- **Obsidian**: Bidirectional links, graph visualization, plugin system
- **VSCode**: Command palette, breadcrumbs, status bar, keyboard-first
- **Notion**: Rich formatting, database properties, collaborative editing
- **Roam Research**: Networked thoughts, context-aware suggestions

### 11.2 Color Palette (Dark Mode)

```
Background: #1e1e1e
Surface: #2d2d2d
Accent: #6366f1 (Indigo)
Text Primary: #ffffff
Text Secondary: #a0a0a0
Border: #3d3d3d
Success: #10b981
Warning: #f59e0b
Error: #ef4444
```

### 11.3 Typography

- **Heading**: Inter, Bold, 18-24px
- **Body**: Inter, Regular, 14-16px
- **Mono**: JetBrains Mono, Regular, 12-14px

### 11.4 Component Library

- **UI Components**: Headless UI (already in use)
- **Editor**: Lexical (already in use)
- **Icons**: Heroicons
- **Graphs**: react-force-graph (for Phase 2)
- **Tooltips**: Headless UI / Radix UI Popover

---

## 12. Success Criteria

✅ **MVP Complete When**:
1. All Phase 1 features implemented and tested
2. No console errors or warnings
3. Lighthouse performance score ≥ 85
4. Keyboard shortcuts fully functional
5. 70%+ test coverage for editor logic
6. User acceptance testing passed (3+ test users)
7. Documentation complete (inline code + guides)

✅ **Production Ready When**:
1. All Phase 1 + Phase 2 features complete
2. Accessibility audit passed (WCAG 2.1 AA)
3. E2E tests for critical flows passing
4. Load testing completed (supports 100 concurrent users)
5. Security audit cleared
6. User documentation published

---

## Approval Sign-Off

- **Product Manager**: _____ Date: _____
- **Lead Developer**: _____ Date: _____
- **UX Designer**: _____ Date: _____
- **QA Lead**: _____ Date: _____
