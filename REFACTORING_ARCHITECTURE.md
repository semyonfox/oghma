# Notes Layout - Architecture & Dependencies

## Current Architecture

### Component Tree (Desktop, >1024px)

```
NotesPage (/notes or /notes/[id])
│
├─ NotesProviders (8 state containers)
│  │
│  └─ NotesUI
│     │
│     ├─ <nav> (sticky, z-40)
│     │  ├─ NoteNav
│     │  │  ├─ Breadcrumb
│     │  │  ├─ Search input (disabled)
│     │  │  ├─ Share button
│     │  │  ├─ Editor width button
│     │  │  └─ Menu button
│     │  │
│     │  └─ Avatar
│     │
│     └─ <div className="flex flex-1 overflow-hidden">
│        │
│        └─ <Allotment> (split panes)
│           │
│           ├─ Pane 1: Sidebar (minSize: 200, maxSize: 600)
│           │  │
│           │  └─ Sidebar
│           │     ├─ NoteSidebarHeader
│           │     │  ├─ Logo + Title
│           │     │  ├─ New Note button
│           │     │  └─ Collapse toggle
│           │     │
│           │     ├─ NoteSidebarSearch
│           │     │  └─ Search input (opens SearchModal)
│           │     │
│           │     ├─ NoteSidebarFavorites
│           │     │  └─ List of pinned notes
│           │     │
│           │     ├─ SidebarList (scrollable, flex-1)
│           │     │  └─ Tree<HierarchicalTreeItemModel>
│           │     │     └─ NodeRenderer
│           │     │        └─ SidebarListItem (per node)
│           │     │           ├─ Icon/Emoji
│           │     │           ├─ Title (or rename input)
│           │     │           ├─ Menu button
│           │     │           └─ Add note button
│           │     │           │
│           │     │           └─ NoteContextMenu (on right-click)
│           │     │              └─ Popup menu
│           │     │
│           │     ├─ NoteSidebarStats
│           │     │  └─ Note count, word count
│           │     │
│           │     └─ NoteSidebarActions
│           │        ├─ Theme toggle
│           │        ├─ Settings link
│           │        ├─ Trash button
│           │        └─ User profile section
│           │
│           ├─ Pane 2: Editor (flex-grow)
│           │  │
│           │  └─ Editor (if note selected)
│           │     └─ LexicalEditor
│           │
│           └─ Pane 3: Right Panel (minSize: 0, maxSize: 350)
│              │
│              └─ <div> (p-4)
│                 ├─ "Note Info" heading
│                 ├─ Note metadata
│                 │  ├─ ID
│                 │  ├─ Title
│                 │  ├─ Content length
│                 │  └─ Word count
│                 │
│                 └─ "AI Features (Coming Soon)" section
│
├─ SearchModal (portal at root)
│  └─ Dialog (Headless UI)
│     ├─ Search input
│     └─ Results list
│
├─ TrashModal (portal at root)
│  └─ Dialog
│     └─ Trash items list
│
├─ PreviewModal (portal at root)
│  └─ Dialog
│     └─ Preview content
│
├─ ShareModal (portal at root)
│  └─ Dialog
│     └─ Share settings
│
├─ LinkToolbar (portal at root)
│  └─ Toolbar for editor links
│
└─ EditorWidthSelect (portal at root)
   └─ Dropdown menu
```

### State Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    NotesProviders                            │
│         (wraps all components with 8 containers)            │
└─────────────────────────────────────────────────────────────┘
         │
         ├─ CsrfTokenState (10 lines)
         │  └─ Manages CSRF token for API calls
         │
         ├─ UIState (56 lines)
         │  ├─ ua: UserAgentType (mobile/tablet/browser detection)
         │  ├─ sidebar: { isFold, toggle() }
         │  ├─ split: { sizes, saveSizes() }
         │  ├─ title: { ... }
         │  └─ settings: { theme, ... }
         │  │
         │  └─ Consumed by:
         │     ├─ Sidebar (reads ua, sidebar)
         │     ├─ NotesUI (reads split, ua)
         │     ├─ NoteNav (reads ua)
         │     ├─ NoteSidebarActions (reads settings)
         │     └─ EditorWidthSelect (reads, writes split)
         │
         ├─ NoteTreeState (285 lines)
         │  ├─ tree: HierarchicalTree
         │  ├─ moveItem()
         │  ├─ mutateItem()
         │  ├─ initTree()
         │  ├─ collapseAllItems()
         │  └─ genNewId()
         │  │
         │  └─ Consumed by:
         │     ├─ SidebarList (reads tree, calls move/mutate)
         │     ├─ SidebarListItem (reads tree, calls mutate)
         │     └─ NoteNav (reads tree, getPaths)
         │
         ├─ NoteState (212 lines)
         │  ├─ note: NoteModel | null
         │  ├─ loading: boolean
         │  ├─ createNote()
         │  ├─ mutateNote()
         │  ├─ removeNote()
         │  └─ fetchNote()
         │  │
         │  └─ Consumed by:
         │     ├─ NotesUI (reads note, calls fetchNote)
         │     ├─ NoteNav (reads note)
         │     ├─ SidebarList (calls removeNote)
         │     ├─ NoteSidebarFavorites (reads note)
         │     ├─ ShareModal (reads, writes note)
         │     └─ Editor (reads/writes via useEditorStore)
         │
         ├─ SearchState (23 lines)
         │  ├─ keyword: string
         │  ├─ setKeyword()
         │  └─ filterNotes()
         │  │
         │  └─ Consumed by:
         │     ├─ SearchModal (reads, writes)
         │     └─ NoteSidebarSearch (writes)
         │
         ├─ TrashState (81 lines)
         │  ├─ trash: TrashItem[]
         │  ├─ restore()
         │  └─ delete()
         │  │
         │  └─ Consumed by:
         │     └─ TrashModal (reads, writes)
         │
         ├─ EditorModeState (55 lines)
         │  ├─ mode: 'edit' | 'view'
         │  └─ toggleMode()
         │  │
         │  └─ Consumed by:
         │     └─ Editor
         │
         └─ PortalState (53 lines)
            ├─ search: { open, close, visible }
            ├─ trash: { open, close, visible }
            ├─ share: { open, close, visible, data }
            ├─ menu: { open, close, visible, data }
            ├─ editorWidthSelect: { open, close }
            └─ preview: { open, close }
            │
            └─ Consumed by:
               ├─ SearchModal
               ├─ TrashModal
               ├─ ShareModal
               ├─ SidebarListItem (menu)
               ├─ NoteContextMenu
               ├─ NoteSidebarSearch
               ├─ NoteSidebarActions (trash)
               └─ NoteNav (share, menu, editorWidthSelect)
```

### Render Flow on Note Selection

```
User clicks note in tree
│
├─ SidebarListItem → router.push(`/notes/${id}` or `/${id}`)
│
├─ Next.js navigation → pathname change
│
├─ NotesUI.usePathname() → noteId extracted
│
├─ NotesUI.useEffect() → fetchNote(noteId)
│
├─ NoteState.fetchNote() → API call
│
├─ Note data returned → NoteState updated
│
├─ NotesUI.useEffect() → useEditorStore.setState({ note })
│
├─ Editor component re-renders with note.content
│
├─ Right panel re-renders with metadata
│
└─ NoteNav re-renders with breadcrumbs

❌ ISSUE: Full NotesUI re-render on any NoteState change
       This causes SidebarList to re-render too
       Even though sidebar data hasn't changed
```

---

## Current Issues & Bottlenecks

### Issue #1: Component Re-rendering Chain

```
NoteState change (user types)
│
├─ NotesUI subscribes to NoteState → FULL RE-RENDER
│
├─ Sidebar re-renders (unnecessary)
│  ├─ SidebarList re-renders (unnecessary)
│  │  └─ All SidebarListItem re-render (unnecessary)
│  │
│  └─ NoteSidebarFavorites re-renders (has NoteState dep)
│
└─ Editor re-renders (necessary)

Current: 30+ component re-renders per keystroke
Target: <5 re-renders per keystroke (only Editor + NoteNav)
```

### Issue #2: Route Duplication

```
/notes/page.tsx (206 lines)
│
└─ exports NotesPage
   └─ Same code as /notes/[id]/page.tsx

/notes/[id]/page.tsx (206 lines)
│
└─ exports NotesPage
   └─ Same code (only import order differs)

Problem: Any bug fix needs changes in 2 places
Problem: DRY violation
```

### Issue #3: Sidebar Styling Chaos

```
Main layout: bg-surface, text-text (semantic CSS variables)
Sidebar:     bg-gray-900, text-gray-400 (hardcoded Tailwind)
Buttons:     hover:bg-white/5, hover:bg-neutral-100 (mix of both)

Theme toggle switches CSS variables but sidebar hardcoded colors don't respond
```

### Issue #4: No Performance Metrics

```
No memoization → impossible to optimize
No profiler metrics → can't measure improvement
No benchmarks → decisions based on gut feeling
```

### Issue #5: Search Not Debounced

```
User types "f-o-l-d-e-r"
│
├─ keystroke 1: 'f' → filterNotes() → 10+ results → re-render
├─ keystroke 2: 'o' → filterNotes() → 5 results → re-render
├─ keystroke 3: 'l' → filterNotes() → 2 results → re-render
├─ keystroke 4: 'd' → filterNotes() → 1 result → re-render
├─ keystroke 5: 'e' → filterNotes() → 0 results → re-render
└─ keystroke 6: 'r' → filterNotes() → 1 result → re-render

Total: 6 API calls for 1 search

Solution: Debounce to 500ms = 1 API call max
```

---

## Target Architecture (After Refactoring)

### Component Tree (Target)

```
NotesPage (/notes - single consolidated route)
│
├─ NotesProviders (8 state containers - same)
│  │
│  └─ NotesUI
│     │
│     ├─ <nav> (sticky, z-40)
│     │  ├─ NoteNav (OPTIMIZED: only re-renders on note change)
│     │  │  ├─ Breadcrumb (MEMOIZED)
│     │  │  ├─ ActionButtons (NEW COMPONENT, MEMOIZED)
│     │  │  └─ LoadingIndicator (MEMOIZED)
│     │  │
│     │  └─ Avatar
│     │
│     └─ <div className="flex flex-1 overflow-hidden">
│        │
│        └─ <Allotment>
│           │
│           ├─ Pane 1: NavigationSidebar (NEW)
│           │  │ Width: 48-64px (fixed)
│           │  ├─ Logo icon
│           │  ├─ Collapse toggle
│           │  └─ Quick nav icons
│           │
│           ├─ Pane 2: TreeSidebar (REFACTORED)
│           │  │ Width: collapsible (200-600px)
│           │  │
│           │  └─ Sidebar (MEMOIZED)
│           │     ├─ NoteSidebarHeader
│           │     ├─ NoteSidebarSearch
│           │     ├─ NoteSidebarFavorites (MEMOIZED)
│           │     │
│           │     ├─ SidebarList (OPTIMIZED)
│           │     │  └─ Tree (memoized, no tree recompute)
│           │     │     └─ SidebarListItem (MEMOIZED with React.memo)
│           │     │        └─ NoteContextMenu
│           │     │
│           │     ├─ NoteSidebarStats
│           │     └─ NoteSidebarActions
│           │
│           ├─ Pane 3: Editor (flex-grow, UNCHANGED)
│           │  └─ Editor
│           │     └─ LexicalEditor
│           │
│           └─ Pane 4: AIPanel (NEW)
│              │ Width: collapsible (0-350px)
│              │
│              ├─ MetadataSection (MEMOIZED)
│              │  ├─ Note ID
│              │  ├─ Title
│              │  ├─ Dates
│              │  └─ Stats
│              │
│              ├─ InsightsSection (MEMOIZED)
│              │  └─ AI insights (future)
│              │
│              └─ QuickActionsSection (MEMOIZED)
│                 ├─ Share button
│                 ├─ Export button
│                 └─ More options
│
├─ SearchModal (uses Modal base, OPTIMIZED with debounce)
├─ TrashModal (uses Modal base)
├─ PreviewModal (uses Modal base)
├─ ShareModal (uses Modal base)
├─ LinkToolbar
└─ EditorWidthSelect
```

### Optimized State Flow

```
User types in editor
│
├─ LexicalEditor internal state → no NotesUI re-render
│
├─ On blur or save interval → NoteState.mutateNote()
│
├─ NoteState subscribers:
│  ├─ NoteNav (ONLY component re-renders - breadcrumb, metadata)
│  │
│  └─ Right panel AIPanel (ONLY this re-renders)
│
└─ Sidebar (NO RE-RENDER - uses selector hooks)

Current: 30+ re-renders per keystroke
Target: 2-3 re-renders per keystroke
```

---

## Refactoring Changes Summary

| Component | Current | Target | Change |
|-----------|---------|--------|--------|
| **Structure** | 3-pane | 4-section | Add NavSidebar, extract AIPanel |
| **Routes** | 2 files, duplicated | 1 file | Consolidate page.tsx + [id]/page.tsx |
| **Memoization** | 0 | 12+ | Add React.memo, useMemo, useCallback |
| **Styling** | Hardcoded dark | Semantic + CSS module | Move to sidebar.css |
| **Modals** | 4 separate impls | 1 Modal base + 4 variants | Consolidate dialog patterns |
| **Files** | 23 | 18 | Delete 5 (consolidate) |
| **Lines** | 3,581 | 2,800 | Remove duplication, move styling to CSS |

---

## Dependency Resolution After Refactoring

### Before: Re-render cascade
```
NoteState change
│
└─ NotesUI (container, re-renders full tree)
   ├─ NoteNav ✓ (should update)
   ├─ Sidebar ❌ (shouldn't update)
   │  ├─ SidebarList ❌ (shouldn't update)
   │  │  └─ SidebarListItem[100+] ❌ (shouldn't update)
   │  └─ NoteSidebarFavorites ❌ (shouldn't update)
   └─ Editor ✓ (should update)
```

### After: Selective updates
```
NoteState change
│
├─ NoteNav (subscribed via selector, selective re-render) ✓
│
├─ Sidebar (no subscription, no re-render) ✓
│  ├─ SidebarList (receives props, not re-render) ✓
│  └─ NoteSidebarFavorites (receives props, memoized) ✓
│
└─ Editor (subscribed via useEditorStore, selective re-render) ✓
   └─ AIPanel (subscribed via selector, selective re-render) ✓
```

---

## Performance Targets

### Render Count Reduction

| Action | Before | After | Target |
|--------|--------|-------|--------|
| Click note | 15 renders | 5 renders | <8 |
| Type in editor | 30 renders/sec | 3-5 renders | <10 |
| Expand folder | 8 renders | 2 renders | <4 |
| Search input | 6 renders per keystroke | 1 render (debounced) | 1 |

### File Size Reduction

| Location | Before | After | Reduction |
|----------|--------|-------|-----------|
| sidebar-list.tsx | 314 lines | 200 lines | -36% |
| sidebar-list-item.tsx | 234 lines | 150 lines | -36% |
| Sidebar folder total | 1,100+ lines | 700 lines | -36% |
| app/notes routes | 412 lines | 206 lines | -50% |
| **Total** | **3,581 lines** | **2,800 lines** | **-22%** |

---

## Migration Path

```
Phase 1: Routes & State Setup
│        ├─ No visual changes
│        └─ Unblocks all other phases
│
Phase 2: Component Extraction
│        ├─ 4-section layout visible
│        └─ Unblocks Phase 3
│
Phase 3: Performance Optimization
│        ├─ Render counts reduced
│        └─ Unblocks Phase 4
│
Phase 4: Styling Consistency
│        ├─ Visual improvements
│        └─ No blocking
│
Phase 5: Accessibility Polish
         ├─ A11y improvements
         └─ Release-ready

(Phases 4 & 5 can run parallel to earlier phases)
```

---

## Testing Strategy by Phase

### Phase 1
```
Unit tests:
- Route consolidation (both /notes and /notes/[id] work)
- State selectors (useNoteTitle, useTreePath return correct values)

Integration tests:
- Navigate to /notes → renders
- Navigate to /notes/abc123 → renders correct note
- Select note in tree → URL updates, note loads
```

### Phase 2
```
Visual tests:
- 4 sections visible: nav + tree + editor + ai
- No broken functionality
- Responsive design works

Snapshot tests:
- New components render without errors
```

### Phase 3
```
Performance tests (React DevTools Profiler):
- Before: SidebarListItem renders 20+ times on note change
- After: SidebarListItem renders <5 times
- Search: input → 1 API call max (not 6)

Load tests:
- 1000 notes in tree → no lag
```

### Phase 4
```
Visual tests (both themes):
- Light mode: colors correct
- Dark mode: colors correct
- Sidebar styling consistent

Regression tests:
- All functionality still works
- No broken CSS
```

### Phase 5
```
A11y tests:
- ARIA labels present (axe-core)
- Keyboard navigation works
- Screen reader friendly

User tests:
- Keyboard-only navigation
- Screen reader (NVDA, JAWS, VoiceOver)
```

---

## Success Indicators

### Code Quality
- ✓ No duplication (merged routes)
- ✓ Components < 150 lines (or split further)
- ✓ Consistent styling patterns
- ✓ All components memoized where beneficial

### Performance
- ✓ React DevTools shows 40-60% fewer renders
- ✓ Search debounced (500ms)
- ✓ Tree operations < 100ms
- ✓ First interaction < 100ms

### User Experience
- ✓ 4-section layout matches design
- ✓ Keyboard navigation works
- ✓ Theme toggle works
- ✓ Sidebar collapse/expand smooth

### Maintainability
- ✓ New developers understand structure in <30 min
- ✓ Changes isolated to single files
- ✓ Clear dependency graph
- ✓ Tests cover critical paths

---

## Architecture Decision Records (ADRs)

### ADR-1: Keep Allotment for Split Panes
**Decision**: Continue using `allotment` library for drag-to-resize panes
**Rationale**: Proven, mature, no migration cost, works well
**Alternative**: Custom CSS Grid + ResizeObserver (high effort, low benefit)

### ADR-2: Consolidate Routes into Single File
**Decision**: Merge `/notes/page.tsx` and `/notes/[id]/page.tsx` into one
**Rationale**: 99% identical code, DRY principle, easier maintenance
**Alternative**: Keep separate (duplication, harder to maintain)

### ADR-3: Use React.memo for SidebarListItem
**Decision**: Memoize list items with reference equality check
**Rationale**: List renders 100+ items, prevents cascading re-renders
**Alternative**: Virtual scrolling (more complex, overkill)

### ADR-4: Debounce Search Input
**Decision**: 500ms debounce before API call
**Rationale**: Reduces API load, common UX pattern, faster feel
**Alternative**: No debounce (API hammering, lag), instant search (janky)

### ADR-5: Extract AIPanel as New Component
**Decision**: Create `ai-panel/` subdirectory with sub-components
**Rationale**: Separates concerns, easier to add AI features, clean API
**Alternative**: Keep in page component (more monolithic)

### ADR-6: Use CSS Module for Sidebar Styling
**Decision**: Create `sidebar.css` with Tailwind @apply classes
**Rationale**: Cleaner components, easier theming, style isolation
**Alternative**: Inline Tailwind (verbose, hard to maintain)

---

## Rollback Plan

If Phase X fails:
1. Revert to last good commit
2. Investigate in separate branch
3. Fix issue
4. Re-attempt phase

**Checkpoint commits:**
- After Phase 1: Tag `refactor/phase-1-complete`
- After Phase 2: Tag `refactor/phase-2-complete`
- After Phase 3: Tag `refactor/phase-3-complete`
- After Phase 4: Tag `refactor/phase-4-complete`
- After Phase 5: Tag `refactor-complete`

All phases are independently reversible.

---

## References

- **React.memo**: https://react.dev/reference/react/memo
- **React DevTools Profiler**: https://react-devtools-tutorial.vercel.app/
- **Tailwind Dark Mode**: https://tailwindcss.com/docs/dark-mode
- **Allotment**: https://github.com/johnwalley/allotment
- **Unstated-next**: https://github.com/jamiebuilds/unstated-next
- **WCAG 2.1 AA**: https://www.w3.org/WAI/WCAG21/quickref/
