# Notes Page Layout Refactoring Report
**Comprehensive Analysis & Staging Plan**

Generated: 2026-02-17

---

## Executive Summary

The `/notes` page currently implements a **3-pane layout** (sidebar + editor + right panel) using `Allotment` split-pane library with tightly coupled components across ~3,581 lines of code in `src/components/notes/`. The refactoring target is a **4-section professional layout** with:
1. **Far-left navigation sidebar** (logo, collapse toggle, fixed width ~48-64px)
2. **Left tree sidebar** (note hierarchy, search, favorites, collapsible)
3. **Center editor** (main content area, flexible)
4. **Right AI tools panel** (insights, metadata, AI features, collapsible)

**Key Findings:**
- **Route duplication**: `src/app/notes/page.tsx` and `src/app/notes/[id]/page.tsx` are nearly identical (206 lines each) with only import order differences
- **State complexity**: 8 separate Zustand/unstated-next containers managing UI, notes, tree, search, trash, editor, portals, CSRF
- **Component fragmentation**: 23 components across 2,300+ lines of sidebar-related code with tight interdependencies
- **Styling inconsistency**: Mixed Tailwind patterns (gray-900, white/5 opacity, hardcoded border colors vs semantic variables)
- **Performance issues**: SidebarList renders full tree on every state change (no React.memo on SidebarListItem), context menus trigger portal state updates
- **Accessibility gaps**: Missing ARIA labels on tree nodes, limited keyboard navigation in modals

---

## Detailed Component Analysis

| Component | Location | Lines | Current Issues | Priority | Dependencies |
|-----------|----------|-------|-----------------|----------|--------------|
| **Sidebar** | `sidebar/sidebar.tsx` | 141 | Dual render paths (collapsed/expanded), hardcoded styling, no mobile optimization | HIGH | UIState, NoteTreeState, 6 sub-components |
| **SidebarList** | `sidebar/sidebar-list.tsx` | 314 | **No memoization**, tree hierarchy computed on every render, onMove handler complexity, stale closure risks | CRITICAL | NoteTreeState, NoteState, react-arborist, SidebarListItem |
| **SidebarListItem** | `sidebar/sidebar-list-item.tsx` | 234 | No memo/useMemo optimizations, inline handlers, complex Link routing logic, emoji parsing on every render | HIGH | NoteTreeState, PortalState, useI18n, emojiRegex |
| **NoteNav** | `note-nav.tsx` | 175 | Breadcrumb logic mixed with action buttons, no state selectors (full component re-renders on any note change) | MEDIUM | NoteState, UIState, NoteTreeState, PortalState |
| **NoteSidebarHeader** | `sidebar/note-sidebar-header.tsx` | 54 | Functional but well-isolated, manual toggle logic | LOW | UIState |
| **NoteSidebarSearch** | `sidebar/note-sidebar-search.tsx` | 45 | Simple but SearchState dependency, direct portal access | MEDIUM | SearchState, PortalState |
| **NoteSidebarFavorites** | `sidebar/note-sidebar-favorites.tsx` | 58 | No filtering logic, hardcoded spacing, NoteState dependency | MEDIUM | NoteState |
| **NoteSidebarStats** | `sidebar/note-sidebar-stats.tsx` | 56 | Simple display component, but always computed even when folded | LOW | Derived from props |
| **NoteSidebarActions** | `sidebar/note-sidebar-actions.tsx` | 123 | Fetches user data on mount (no memo), theme toggle works, API call lacks error retry | MEDIUM | UIState, PortalState, getCurrentUser API |
| **NoteContextMenu** | `sidebar/note-context-menu.tsx` | 199 | Correct context menu impl but position can escape viewport, no animation | MEDIUM | Local state, event listeners |
| **SearchModal** | `search-modal.tsx` | 171 | Dialog pattern correct but filterNotes called on every keyword change (no debounce), full re-render on results | MEDIUM | SearchState, PortalState, router |
| **TrashModal** | `trash-modal.tsx` | 140 | Similar pattern to SearchModal, no optimizations | MEDIUM | TrashState, PortalState |
| **PreviewModal** | `preview-modal.tsx` | 72 | Minimal, well-scoped | LOW | Portal state pattern |
| **ShareModal** | `sharing/share-modal.tsx` | 141 | Uses Headless UI Dialog (correct), but note mutation on share state change | MEDIUM | PortalState, NoteState |
| **EditorWidthSelect** | `editor-width-select.tsx` | 69 | Dropdown UI pattern correct, minimal dependencies | LOW | PortalState, UIState |
| **Providers** | `providers.tsx` | 59 | 8 nested providers (unavoidable), modals/toolbars rendered at root level (correct) | N/A | All state containers |
| **FilterModal** | `filter-modal.tsx` | 67 | Filter logic component, minimal dependencies | MEDIUM | PortalState |
| **LinkToolbar** | `link-toolbar.tsx` | 79 | Editor toolbar, tight coupling to editor state | MEDIUM | Editor internals |
| **MarkText** | `mark-text.tsx` | 39 | Simple utility, well-isolated | N/A | None |
| **[id]/page.tsx** | `src/app/notes/[id]/page.tsx` | 206 | **DUPLICATE** of /notes/page.tsx, code duplication violation | CRITICAL | NotesProviders, Allotment, components |
| **/page.tsx** | `src/app/notes/page.tsx` | 206 | Main layout page, Allotment handles split panes, right panel hardcoded metadata/AI info | HIGH | Same as [id]/page |

**TOTAL NOTES COMPONENTS: 23 files, ~3,581 lines**

---

## Styling Analysis

### Current Patterns
- **Sidebar**: Dark theme hardcoded (`bg-gray-900`, `text-gray-400`, `border-white/10`)
- **Main layout**: Semantic colors from CSS variables (` bg-surface`, `text-text`, `border-border`)
- **Spacing**: Inconsistent (px-3/px-4/px-6, py-2/py-3/py-4)
- **Tailwind Config**: Uses CSS variable color extensions for semantic theming (25 color scale variants)

### Issues
1. **Sidebar styling conflicts**: Dark theme hardcoding vs semantic variables in other components
2. **Responsive gaps**: `md:w-11` used instead of consistent breakpoint strategy
3. **Z-index chaos**: `z-40` (navbar), `z-50` (context menu), no system
4. **Border colors**: Hardcoded `border-white/10`, `border-white/20`, `border-neutral-200` across components
5. **Opacity hover states**: Inconsistent (some use `hover:bg-white/5`, others `hover:bg-neutral-100`)

### Recommendations
- Extract sidebar styling to CSS module or Tailwind component classes
- Use semantic color tokens consistently (`text-text`, `bg-surface`, etc.)
- Establish z-index scale (10: modals, 20: dropdowns, 30: nav)
- Use Tailwind spacing scale uniformly (p-4, gap-3, etc.)

---

## State Management Architecture

```
NotesProviders (wraps all)
├── CsrfTokenState (10 lines, minimal)
├── UIState (sidebar, split, settings, title)
│   └── useSidebar, useSplit, useSettings, useTitle
├── NoteTreeState (285 lines, tree operations)
│   └── moveItem, mutateItem, initTree, collapseAllItems
├── NoteState (212 lines, current note + CRUD)
│   └── createNote, mutateNote, removeNote, fetchNote
├── SearchState (23 lines, search query)
├── TrashState (81 lines, trash operations)
├── EditorModeState (55 lines, edit/view toggle)
└── PortalState (53 lines, modal/portal management)
    └── search, trash, share, menu, editorWidthSelect portals
```

**Issues:**
- **No memoization of selectors**: Components re-render on any state change
- **No batching**: Multiple state updates trigger multiple renders
- **Deep nesting**: 8 providers increase context subscription overhead
- **Portal pattern**: Modals rendered at root but state accessed from deep components

---

## Performance Bottlenecks

| Bottleneck | Location | Impact | Root Cause |
|------------|----------|--------|-----------|
| SidebarList full re-render | sidebar-list.tsx line 252-310 | **HIGH** | Tree render on every note mutation |
| SidebarListItem no memo | sidebar-list-item.tsx | **HIGH** | No React.memo despite list context |
| emojiRegex parsing | sidebar-list-item.tsx line 125-129 | **MEDIUM** | Computed on every render, no cache |
| useI18n hook calls | sidebar components | **MEDIUM** | Hook called in multiple child components |
| SearchModal filterNotes | search-modal.tsx line 20 | **HIGH** | No debounce, searches on every keystroke |
| TreeApi imperative calls | sidebar-list.tsx line 177, 198 | **MEDIUM** | Sync state between imperative API and React state |
| Portal state subscriptions | NoteContextMenu | **MEDIUM** | Component subscribe to full portal state |
| notifyItem mutations | tree.ts, sidebar-list.tsx | **MEDIUM** | No optimistic updates, always async |

---

## Dependency Graph

```
App Routes (/notes, /notes/[id])
  └─ NotesProviders
      ├─ NotesUI
      │   ├─ NoteNav (reads NoteState, UIState, NoteTreeState, PortalState)
      │   ├─ Allotment (pane splitter)
      │   │   ├─ Sidebar
      │   │   │   ├─ NoteSidebarHeader (UIState)
      │   │   │   ├─ NoteSidebarSearch (SearchState, PortalState)
      │   │   │   ├─ NoteSidebarFavorites (NoteState)
      │   │   │   ├─ SidebarList (NoteTreeState, NoteState, react-arborist)
      │   │   │   │   └─ SidebarListItem (NoteTreeState, PortalState, useI18n)
      │   │   │   │       └─ NoteContextMenu (local state, event handlers)
      │   │   │   ├─ NoteSidebarStats (props)
      │   │   │   └─ NoteSidebarActions (UIState, PortalState, API)
      │   │   ├─ Editor (useEditorStore, NoteState)
      │   │   └─ Right Panel (metadata, AI info)
      │   ├─ SearchModal (SearchState, PortalState, router)
      │   ├─ TrashModal (TrashState, PortalState)
      │   ├─ PreviewModal (PortalState)
      │   └─ ShareModal (PortalState, NoteState)
```

**Critical paths:**
- NoteState change → NoteNav re-render → full UI re-render
- NoteTreeState change → SidebarList re-render → all items re-render
- PortalState change → menu/NoteContextMenu re-render

---

## Current Layout Structure

### Desktop (>1024px)
```
┌─────────────────────────────────────────────────────────┐
│ NoteNav (breadcrumbs, search, share, menu)              │ height: auto
├─────────────────────────────────────────────────────────┤
│ Allotment                                               │
├─────┬──────────────────────┬──────────────────────────┤
│ L   │ Editor               │ Right (metadata/AI)      │
│ Sidebar (collapsed at 48px)│                          │
│ or expanded (w-72)         │ minSize: 0               │
│ minSize: 200              │ maxSize: 350             │
│ maxSize: 600              │                          │
└─────┴──────────────────────┴──────────────────────────┘
```

### Mobile (<1024px)
```
┌────────────────────────────────┐
│ NoteNav (logo + avatar only)   │
├────────────────────────────────┤
│ Sidebar (w-4/5) or Editor      │
│ (overlaid, collapsible)        │
└────────────────────────────────┘
```

---

## Target 4-Section Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Top Navbar (logo, breadcrumbs, search, user menu)              │
├────┬────────────────┬─────────────────────────┬────────────────┤
│ FAR│  LEFT TREE     │  CENTER EDITOR          │  RIGHT AI PANEL│
│ LFT│  SIDEBAR       │                         │                │
│    │                │                         │                │
│NAV │ ┌────────────┐ │  Lexical Editor         │ ┌────────────┐ │
│    │ │ Search     │ │  (fullscreen)           │ │ AI Tools   │ │
│ (48px
│ opt
│    │ ├────────────┤ │                         │ ├────────────┤ │
│ collaps
│    │ │ Favorites  │ │                         │ │ Metadata   │ │
│ toggle)
│    │ ├────────────┤ │                         │ │ • Title    │ │
│    │ │ Tree       │ │                         │ │ • Updated  │ │
│    │ │ • Folder 1 │ │                         │ │ • Words    │ │
│    │ │   • Note A │ │                         │ │ • Backlinks│ │
│    │ │ • Folder 2 │ │                         │ │            │ │
│    │ │ Collapse ▲ │ │                         │ │ ┌────────┐ │ │
│    │ └────────────┘ │                         │ │ │AI Promo│ │ │
│    │                │                         │ │ │Coming..│ │ │
│    │ Stats, Actions │                         │ │ └────────┘ │ │
│    │ (bottom)       │                         │ └────────────┘ │
└────┴────────────────┴─────────────────────────┴────────────────┘
```

---

## Refactoring Recommendations

### 1. Consolidate Routes (CRITICAL)
**Files:** `src/app/notes/page.tsx`, `src/app/notes/[id]/page.tsx`
- **Issue**: 99% identical code duplication
- **Solution**: Merge into single component with route-aware logic OR consolidate logic into `src/app/notes/layout.tsx`
- **Effort**: 30 minutes
- **Benefit**: Single source of truth, easier maintenance

### 2. Extract Navigation Sidebar (NEW COMPONENT)
**Create:** `src/components/notes/navigation-sidebar.tsx`
- **Width**: Fixed 48-64px
- **Contents**: Logo, collapse toggle, quick nav icons
- **Current pattern**: Exists partially in sidebar.tsx (lines 37-70) but not extracted
- **Effort**: 1 hour
- **Benefit**: Cleaner separation, easier responsive design

### 3. Refactor Tree Sidebar (DECOMPOSE)
**Files:** `sidebar-list.tsx` (314 lines), `sidebar-list-item.tsx` (234 lines)
- **Issue**: SidebarList and SidebarListItem need memoization and performance optimization
- **Solution**:
  - Wrap `SidebarListItem` with `React.memo` + useCallback memoization
  - Extract tree rendering logic to custom hook
  - Add `useMemo` for treeData and initialOpenState
  - Debounce onMove callback
- **Effort**: 2-3 hours
- **Benefit**: 40-60% reduction in unnecessary renders

### 4. Create AI Tools Panel Component (NEW)
**Create:** `src/components/notes/ai-panel.tsx`
- **Current state**: Hardcoded metadata in right pane (src/app/notes/page.tsx lines 154-192)
- **Solution**: Extract to dedicated component with section exports
  - NotesMetadata (title, ID, word count, etc.)
  - AIInsights (placeholder for AI features)
  - QuickActions (share, export buttons)
- **Effort**: 1.5 hours
- **Benefit**: Modular, easier to add AI features later

### 5. Standardize Styling (REFACTORING)
**Files:** All sidebar components
- **Issue**: Mixed dark theme hardcodes vs semantic variables
- **Solution**:
  - Create `src/styles/sidebar-theme.css` with component classes
  - Replace `bg-gray-900 text-gray-400 border-white/10` with `@apply sidebar-base`
  - Use semantic color tokens for main layout
- **Effort**: 2 hours
- **Benefit**: Consistency, easier theming

### 6. Optimize State Selectors (PERFORMANCE)
**Files:** `note-nav.tsx`, `sidebar-list.tsx`, `sidebar-list-item.tsx`
- **Issue**: Full component re-renders on any state change (no selectors)
- **Solution**:
  - Extract custom hooks with memoized selectors (e.g., `useNoteTitle`, `useTreePath`)
  - Use `useShallow` or selector pattern to prevent unnecessary re-renders
  - Add `useMemo` to computed values
- **Effort**: 3 hours
- **Benefit**: 30-50% reduction in re-renders

### 7. Consolidate Modals (CLEANUP)
**Files:** `search-modal.tsx`, `trash-modal.tsx`, `preview-modal.tsx`, `share-modal.tsx`
- **Issue**: Repetitive Dialog pattern, redundant state management
- **Solution**: Create `<Modal>` base component with variants
  - `<Modal.Search>`
  - `<Modal.Trash>`
  - `<Modal.Preview>`
  - `<Modal.Share>`
- **Effort**: 2 hours
- **Benefit**: Reduced duplication, consistent behavior

### 8. Add Keyboard Navigation (ACCESSIBILITY)
**Files:** `sidebar-list-item.tsx`, modals
- **Issue**: Limited arrow key navigation, no focus management
- **Solution**:
  - Implement tree navigation (ArrowUp/Down to traverse)
  - Add Enter to expand/select
  - Tab trap in modals
- **Effort**: 2-3 hours
- **Benefit**: Better accessibility, keyboard power users

---

## Parallel Work Clusters

### Cluster A: Route & State Setup (2-3 hours)
**Can start immediately, foundational for others**
- [ ] Merge route files (page.tsx + [id]/page.tsx)
- [ ] Extract main layout to layout.tsx if using new Router features
- [ ] Setup state selector hooks (useNoteTitle, useTreePath)

### Cluster B: Component Extraction (3-4 hours)
**Depends on Cluster A completion**
- [ ] Extract NavigationSidebar component
- [ ] Extract AI Panel component
- [ ] Extract Modal base component
- [ ] Can run in parallel with Cluster C after Cluster A

### Cluster C: Performance Optimization (4-5 hours)
**Independent from B, depends on state setup**
- [ ] Add React.memo to SidebarListItem
- [ ] Optimize SidebarList with useMemo
- [ ] Add useCallback memoization
- [ ] Add debounce to search

### Cluster D: Styling Refactor (2-3 hours)
**Independent, can run parallel with others**
- [ ] Create sidebar-theme.css
- [ ] Replace hardcoded colors with semantic tokens
- [ ] Establish z-index system

---

## Staging Plan

### Phase 1: Foundation & Setup (Estimated: 4-5 hours)
**Dependencies**: None | **Blocking**: All other phases

**Goals:**
- Eliminate route duplication
- Setup state selector hooks
- No visual changes

**Files to modify:**
1. `src/app/notes/page.tsx` - Consolidate with [id]/page.tsx
2. `src/app/notes/[id]/page.tsx` - Delete or redirect
3. `src/lib/notes/state/note.ts` - Add selector hook
4. `src/lib/notes/state/tree.ts` - Add selector hook
5. `src/lib/notes/state/ui.ts` - Add selector hook
6. Create `src/lib/notes/hooks/use-note-selectors.ts` (new)
7. Create `src/lib/notes/hooks/use-tree-selectors.ts` (new)

**Deliverables:**
- Single source of truth for notes layout
- Memoized state selectors available
- No regression in functionality

---

### Phase 2: Component Extraction (Estimated: 5-6 hours)
**Dependencies**: Phase 1 complete | **Blocking**: Phase 3

**Goals:**
- Extract new NavigationSidebar
- Extract AI Panel
- Extract Modal base
- Reduce duplication

**Files to create:**
1. `src/components/notes/navigation-sidebar.tsx` (new)
2. `src/components/notes/ai-panel/index.tsx` (new)
3. `src/components/notes/ai-panel/metadata-section.tsx` (new)
4. `src/components/notes/ai-panel/insights-section.tsx` (new)
5. `src/components/ui/modal.tsx` (new, if not exists)

**Files to modify:**
1. `src/app/notes/page.tsx` - Import new components, update layout structure
2. `src/components/notes/sidebar/sidebar.tsx` - Extract navigation portion
3. `src/components/notes/search-modal.tsx` - Use Modal base component
4. `src/components/notes/trash-modal.tsx` - Use Modal base component
5. `src/components/notes/preview-modal.tsx` - Use Modal base component

**Deliverables:**
- 4-section layout rendered (visual update)
- Modular components
- ~500 lines removed from monolithic files

---

### Phase 3: Performance Optimization (Estimated: 4-5 hours)
**Dependencies**: Phase 2 complete | **Blocking**: Phase 4

**Goals:**
- Reduce unnecessary re-renders by 40-60%
- Optimize tree rendering

**Files to modify:**
1. `src/components/notes/sidebar/sidebar-list-item.tsx`
   - Add React.memo wrapper
   - Memoize callbacks with useCallback
   - Add useMemo for computed values
2. `src/components/notes/sidebar/sidebar-list.tsx`
   - Memoize treeData with useMemo
   - Debounce onMove callback (300ms)
   - Add useCallback to all handlers
3. `src/components/notes/note-nav.tsx`
   - Split into smaller components (Breadcrumbs, ActionButtons)
   - Use state selectors from Phase 1
   - Add useMemo for paths calculation
4. `src/components/notes/search-modal.tsx`
   - Add debounce to keyword input (500ms)
   - Memoize search results

**Deliverables:**
- Perceived performance improvement
- Metrics: render counts down 40-60%
- No broken functionality

---

### Phase 4: Styling Consistency (Estimated: 2-3 hours)
**Dependencies**: Phase 3 complete | **Blocking**: None (release-ready after this)

**Goals:**
- Unified dark theme
- Semantic color tokens
- Consistent spacing

**Files to create:**
1. `src/styles/components/sidebar.css` (new)

**Files to modify:**
1. `src/components/notes/sidebar/sidebar.tsx` - Use CSS classes
2. `src/components/notes/sidebar/note-sidebar-header.tsx` - Use CSS classes
3. `src/components/notes/sidebar/note-sidebar-search.tsx` - Use CSS classes
4. `src/components/notes/sidebar/note-sidebar-actions.tsx` - Use CSS classes
5. `src/components/notes/sidebar/note-sidebar-favorites.tsx` - Use CSS classes
6. `src/app/globals.css` - Add z-index scale

**Deliverables:**
- Visual consistency
- 200+ lines removed from components (styling moved to CSS)
- Easier theme changes

---

### Phase 5: Accessibility & Polish (Estimated: 3-4 hours)
**Dependencies**: Phase 4 complete | **Blocking**: None

**Goals:**
- Keyboard navigation
- ARIA labels
- Focus management

**Files to modify:**
1. `src/components/notes/sidebar/sidebar-list-item.tsx`
   - Add ARIA labels, role="treeitem"
   - Add keyboard handlers (Arrow Up/Down, Enter, Space)
2. `src/components/ui/modal.tsx`
   - Ensure focus trap
   - Add ARIA dialog attributes
3. `src/components/notes/search-modal.tsx` - Review focus management
4. `src/components/notes/note-nav.tsx` - Add ARIA labels to buttons

**Deliverables:**
- WCAG 2.1 AA compliance
- Keyboard shortcuts documented
- Better user experience for accessibility tools

---

## Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| SidebarList re-renders unexpectedly | HIGH | Medium | Extensive testing with React DevTools Profiler, write perf tests |
| State selector hooks break existing behavior | MEDIUM | High | Unit tests for selectors, integration tests for main flow |
| Styling breaks in dark/light mode | MEDIUM | Medium | Test both themes, use Tailwind dark: prefix |
| Modal base component doesn't fit all use cases | MEDIUM | Low | Prototype with search-modal first, iterate |
| Route consolidation breaks dynamic routes | LOW | High | Test both /notes and /notes/[id] paths thoroughly |
| Tree re-expansion after move breaks | LOW | Medium | Test move operation thoroughly, verify TreeApi sync |

---

## Success Metrics

After refactoring completion:

**Performance:**
- ✓ SidebarListItem renders < 5x per edit session (vs current ~20x)
- ✓ SearchModal input has < 200ms debounce delay
- ✓ Tree operations (expand/collapse) complete in < 100ms

**Code Quality:**
- ✓ Reduce notes components from 23 to 18 files (consolidate modals)
- ✓ Reduce lines in sidebar from 1,100+ to 700 (remove duplication)
- ✓ Increase test coverage from ~30% to 70% for critical paths

**User Experience:**
- ✓ Layout visually matches 4-section design
- ✓ Keyboard navigation works (arrow keys, Tab, Enter, Escape)
- ✓ All ARIA labels present for screen readers

---

## Implementation Checklist

### Phase 1
- [ ] Create feature branch `refactor/consolidate-routes`
- [ ] Merge page.tsx + [id]/page.tsx logic
- [ ] Add state selector hooks
- [ ] Write tests for route behavior
- [ ] Create PR, request review

### Phase 2
- [ ] Create feature branch `refactor/extract-components`
- [ ] Create NavigationSidebar component
- [ ] Create AI Panel component & sub-components
- [ ] Create Modal base component
- [ ] Update main layout to use new components
- [ ] Verify visual (should look same as before)
- [ ] Create PR, request review

### Phase 3
- [ ] Create feature branch `refactor/optimize-perf`
- [ ] Add React.memo to SidebarListItem
- [ ] Add memoization throughout
- [ ] Profile with React DevTools
- [ ] Verify render counts reduced
- [ ] Create PR with perf metrics

### Phase 4
- [ ] Create feature branch `refactor/styling-consistency`
- [ ] Create sidebar CSS module
- [ ] Replace hardcoded colors
- [ ] Test both themes
- [ ] Create PR, review with designer

### Phase 5
- [ ] Create feature branch `refactor/a11y-polish`
- [ ] Add ARIA labels
- [ ] Implement keyboard navigation
- [ ] Test with screen reader
- [ ] Create PR, request accessibility review

---

## Testing Strategy

### Unit Tests (per phase)
- Phase 1: Route consolidation, state selectors
- Phase 2: Component extraction (snapshot tests)
- Phase 3: Memoization (via profiler, no unit tests needed)
- Phase 4: Styling (visual regression tests)
- Phase 5: A11y (axe accessibility tests)

### Integration Tests
- Navigation between notes
- Tree expand/collapse with persistence
- Modal open/close
- All CRUD operations on notes
- Search functionality
- Breadcrumb navigation

### Performance Tests
- React DevTools Profiler (render counts, duration)
- Lighthouse for Core Web Vitals
- Search modal input responsiveness

### Visual Tests
- Screenshot testing of both themes
- Responsive design (mobile, tablet, desktop)
- Dark mode toggle

---

## Estimated Timeline

| Phase | Duration | Complexity | Start | End |
|-------|----------|-----------|-------|-----|
| 1: Foundation | 4-5h | HIGH | Day 1 | Day 1 end |
| 2: Components | 5-6h | MEDIUM | Day 2 start | Day 2 end |
| 3: Performance | 4-5h | HIGH | Day 3 start | Day 3 mid |
| 4: Styling | 2-3h | LOW | Day 3 mid | Day 3 end |
| 5: A11y | 3-4h | MEDIUM | Day 4 start | Day 4 mid |
| **Total** | **18-23h** | - | - | **~2.5 days** |

**Parallel opportunities**: Cluster D (styling) can start once Phase 1 is complete and run parallel to Phase 2.

---

## File Structure After Refactoring

```
src/
├── app/notes/
│   └── page.tsx (consolidated, cleaner)
├── components/notes/
│   ├── navigation-sidebar.tsx (NEW)
│   ├── ai-panel/
│   │   ├── index.tsx (NEW)
│   │   ├── metadata-section.tsx (NEW)
│   │   └── insights-section.tsx (NEW)
│   ├── sidebar/
│   │   ├── sidebar.tsx (refactored, cleaner)
│   │   ├── sidebar-list.tsx (optimized, memoized)
│   │   ├── sidebar-list-item.tsx (React.memo wrapped)
│   │   ├── note-sidebar-header.tsx (unchanged)
│   │   ├── note-sidebar-search.tsx (unchanged)
│   │   ├── note-sidebar-favorites.tsx (unchanged)
│   │   ├── note-sidebar-stats.tsx (unchanged)
│   │   ├── note-sidebar-actions.tsx (unchanged)
│   │   └── note-context-menu.tsx (unchanged)
│   ├── note-nav.tsx (split into sub-components)
│   ├── providers.tsx (unchanged)
│   ├── search-modal.tsx (uses Modal base)
│   ├── trash-modal.tsx (uses Modal base)
│   ├── preview-modal.tsx (uses Modal base)
│   ├── sharing/share-modal.tsx (uses Modal base)
│   ├── (other untouched components)
│   └── ...
├── styles/
│   └── components/
│       └── sidebar.css (NEW - styling consolidation)
├── lib/notes/
│   ├── hooks/
│   │   ├── use-note-selectors.ts (NEW)
│   │   ├── use-tree-selectors.ts (NEW)
│   │   └── (existing hooks)
│   └── state/
│       └── (unchanged)
```

---

## Conclusion

The refactoring is **achievable in 2.5 days** with proper phasing and parallelization. The work addresses critical performance issues, eliminates duplication, and prepares the codebase for the 4-section professional layout. Each phase is independently testable and valuable.

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4 + Phase 5 (concurrent with 4)

**Recommended Approach**: Begin with Phase 1 immediately, complete by end of Day 1. This unblocks all other phases and has immediate value (eliminated duplication). Then proceed with Phases 2-3 in parallel where possible.
