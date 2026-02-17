# Notes Layout Refactoring - Quick Reference

## One-Page Summary

**Current State**: 3-pane layout, 23 components, 3,581 lines, code duplication, performance issues
**Target State**: 4-section layout (nav + tree + editor + AI), optimized, ~2,800 lines, consolidated
**Effort**: 18-23 hours over 2.5 days
**Risk**: LOW (modular phases, backward compatible)

---

## File Size Reference

| Component | Current | Post-Refactor | Change |
|-----------|---------|---------------|---------| 
| Sidebar structure | 1,100+ lines | 700 lines | -36% |
| app/notes pages | 412 lines | 206 lines | -50% |
| Total components | 23 files | 18 files | -22% |

---

## Critical Issues (Fix First)

| Issue | Impact | File | Fix Time |
|-------|--------|------|----------|
| Route duplication | HIGH | page.tsx + [id]/page.tsx | 30 min |
| SidebarList no memo | CRITICAL | sidebar-list.tsx | 2 hours |
| State selector hooks missing | HIGH | all consuming components | 1.5 hours |
| Styling inconsistency | MEDIUM | sidebar/* | 2 hours |

---

## Phase 1: Routes & State (4-5 hours) ⚡ START HERE

**What to do:**
```bash
# 1. Analyze route difference
diff src/app/notes/page.tsx src/app/notes/[id]/page.tsx
# Only difference: import order (lines 3-4 vs 13-17)

# 2. Consolidate into single page with route handling
# Merge both page.tsx, delete [id]/page.tsx OR use layout.tsx pattern

# 3. Create selector hooks
touch src/lib/notes/hooks/use-note-selectors.ts
touch src/lib/notes/hooks/use-tree-selectors.ts

# 4. Add to NoteState.useContainer() output:
# - useNoteTitle() - memoized title only
# - useNoteContent() - content only
# - useNoteLoading() - loading state only
```

**Files to modify:**
```
src/app/notes/page.tsx                    ← Keep, consolidate logic
src/app/notes/[id]/page.tsx              ← Delete after merge
src/lib/notes/hooks/use-note-selectors.ts ← NEW
src/lib/notes/hooks/use-tree-selectors.ts ← NEW
```

**Success criteria:**
- Both routes work identically
- No visual changes
- State selectors created and exported

---

## Phase 2: Extract Components (5-6 hours)

**What to do:**

### 2A. Navigation Sidebar (NEW)
```typescript
// src/components/notes/navigation-sidebar.tsx
export default function NavigationSidebar() {
  // - Logo (📝 Notes or SocsBoard)
  // - Collapse toggle for left sidebar
  // - Fixed width: 48-64px
  // - Dark background
}
```

### 2B. AI Panel (NEW)
```typescript
// src/components/notes/ai-panel/index.tsx
export default function AIPanel({ note }) {
  return (
    <>
      <MetadataSection note={note} />
      <InsightsSection note={note} />
      <QuickActionsSection note={note} />
    </>
  )
}

// src/components/notes/ai-panel/metadata-section.tsx
// src/components/notes/ai-panel/insights-section.tsx
```

### 2C. Modal Base Component
```typescript
// src/components/ui/modal.tsx
export default function Modal({ isOpen, onClose, title, children }) {
  // Base Dialog pattern
  // Used by all modals
}

// Then refactor:
// search-modal.tsx → <Modal.Search />
// trash-modal.tsx → <Modal.Trash />
// preview-modal.tsx → <Modal.Preview />
// share-modal.tsx → <Modal.Share />
```

**Files to create:**
```
src/components/notes/navigation-sidebar.tsx (NEW)
src/components/notes/ai-panel/index.tsx (NEW)
src/components/notes/ai-panel/metadata-section.tsx (NEW)
src/components/notes/ai-panel/insights-section.tsx (NEW)
src/components/ui/modal.tsx (NEW, if not exists)
```

**Files to modify:**
```
src/app/notes/page.tsx (update layout structure)
src/components/notes/sidebar/sidebar.tsx (extract nav portion)
src/components/notes/search-modal.tsx
src/components/notes/trash-modal.tsx
src/components/notes/preview-modal.tsx
src/components/notes/sharing/share-modal.tsx
```

**Success criteria:**
- 4-section layout visually appears
- Modals consolidated and working
- No broken functionality

---

## Phase 3: Optimize Performance (4-5 hours)

**What to do:**

### 3A. Memoize SidebarListItem
```typescript
// src/components/notes/sidebar/sidebar-list-item.tsx

// Before
export default SidebarListItem;

// After
export default React.memo(SidebarListItem, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.isExpanded === next.isExpanded &&
    prev.hasChildren === next.hasChildren &&
    prev.isRenaming === next.isRenaming
  );
});
```

### 3B. Optimize SidebarList
```typescript
// src/components/notes/sidebar/sidebar-list.tsx

// Add memoization:
const treeData = useMemo(() => {
  const hierarchy = makeHierarchy(tree);
  return hierarchy ? hierarchy.children : [];
}, [tree]); // was: no useMemo

// Add callback memoization:
const onMove = useCallback(({ dragIds, parentId, index }) => {
  // ... existing logic
}, [moveItem, tree.items]);

// Add debounce:
const debouncedOnMove = useMemo(
  () => debounce(onMove, 300),
  [onMove]
);
```

### 3C. Search Modal Debounce
```typescript
// src/components/notes/search-modal.tsx

// Add debounce to keyword input
const debouncedFilterNotes = useMemo(
  () => debounce(filterNotes, 500),
  [filterNotes]
);

useEffect(() => {
  if (search.visible && keyword) {
    debouncedFilterNotes().then(setSearchResults);
  }
}, [keyword, search.visible, debouncedFilterNotes]);
```

**Files to modify:**
```
src/components/notes/sidebar/sidebar-list-item.tsx
src/components/notes/sidebar/sidebar-list.tsx
src/components/notes/note-nav.tsx
src/components/notes/search-modal.tsx
```

**How to measure:**
```bash
# Install React DevTools Profiler
# Open in browser, Profiler tab
# Before: SidebarListItem renders 20+ times on note change
# After: SidebarListItem renders <5 times
```

**Success criteria:**
- React DevTools shows 40-60% fewer renders
- User perceives snappier UI
- No broken functionality

---

## Phase 4: Styling Consistency (2-3 hours)

**What to do:**

### 4A. Create sidebar CSS module
```css
/* src/styles/components/sidebar.css */

.sidebar-base {
  @apply bg-gray-900 text-gray-400 border-white/10;
}

.sidebar-section {
  @apply px-6 py-3 border-b border-white/10;
}

.sidebar-button {
  @apply px-3 py-2 text-sm rounded-md 
         text-gray-400 hover:text-white hover:bg-white/5
         transition-colors;
}

.sidebar-button-active {
  @apply text-white bg-white/5;
}
```

### 4B. Update z-index system
```css
/* src/app/globals.css */

:root {
  --z-dropdown: 20;
  --z-modal: 40;
  --z-notification: 50;
}

/* Then use */
.modal { z-index: var(--z-modal); }
```

### 4C. Replace hardcoded colors
```typescript
// Before
<div className="bg-gray-900 text-gray-400 border-white/10 px-6 py-3">

// After
<div className="sidebar-section">
```

**Files to create:**
```
src/styles/components/sidebar.css (NEW)
```

**Files to modify:**
```
src/app/globals.css
src/components/notes/sidebar/*.tsx (all)
```

**Success criteria:**
- Sidebar uses consistent styling
- Colors unified (no mix of gray-900 and semantic variables)
- Both light and dark themes work
- ~200 lines moved from components to CSS

---

## Phase 5: Accessibility & Polish (3-4 hours)

**What to do:**

### 5A. Add ARIA labels
```typescript
// src/components/notes/sidebar/sidebar-list-item.tsx

return (
  <div
    role="treeitem"
    aria-expanded={isExpanded}
    aria-label={`${item.title}${hasChildren ? ', folder' : ', note'}`}
  >
    {/* ... */}
  </div>
);
```

### 5B. Keyboard navigation
```typescript
// Add to sidebar-list-item.tsx
const handleKeyDown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      // Focus next sibling
      break;
    case 'ArrowUp':
      e.preventDefault();
      // Focus previous sibling
      break;
    case 'ArrowRight':
      e.preventDefault();
      // Expand if folder
      onToggle();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      // Collapse if folder
      onToggle();
      break;
    case 'Enter':
      e.preventDefault();
      // Navigate to note
      router.push(`/${item.id}`);
      break;
  }
};
```

**Files to modify:**
```
src/components/notes/sidebar/sidebar-list-item.tsx
src/components/ui/modal.tsx
src/components/notes/note-nav.tsx
```

**How to test:**
```bash
# Test with keyboard only (no mouse)
# Test with screen reader (NVDA, JAWS, VoiceOver)
# Use axe DevTools browser extension
```

**Success criteria:**
- WCAG 2.1 AA compliance
- Navigation works with keyboard
- Screen reader announces tree structure

---

## Dependency Order

```
Phase 1: Routes & State ────┐
                             ├──→ Phase 2: Components ──→ Phase 3: Performance ──→ Phase 4: Styling ──→ Phase 5: A11y
   (runs in parallel)       │
Phase 4: Styling (can start after Phase 1) ────┘
```

**Can do parallel:**
- Phase 1 + Phase 4 (styling independent)
- Phase 2 + Phase 3 (after Phase 1 done)
- Phase 4 + Phase 5 (both low-impact)

---

## Key Metrics to Track

**Before Refactoring:**
```
React renders per action:
- Click note: 12-15 renders
- Search: 8-12 renders per keystroke
- Expand folder: 6-8 renders

Code stats:
- Components: 23 files
- Total lines: 3,581
- Largest file: sidebar-list.tsx (314 lines)
```

**After Refactoring:**
```
React renders per action:
- Click note: 3-5 renders ✓
- Search: 1-2 renders (with debounce) ✓
- Expand folder: 2-3 renders ✓

Code stats:
- Components: 18 files ✓
- Total lines: 2,800 ✓
- Largest file: sidebar-list.tsx (200 lines) ✓
```

---

## Commands to Use

```bash
# Phase 1
npm test -- --testPathPattern="routes|state"

# Phase 2
npm run build  # Check for errors
npm run dev    # Visual inspection

# Phase 3
# Use React DevTools Profiler (Flamegraph tab)
# Record interactions before/after

# Phase 4
# No special test, visual inspection

# Phase 5
npx axe-core # Accessibility testing
```

---

## Common Pitfalls to Avoid

❌ **Don't** optimize before consolidating (Phase 1 first!)
❌ **Don't** change styling during Phase 2 (separate concerns)
❌ **Don't** test Phase 3 by visual inspection (use Profiler)
❌ **Don't** change logic when refactoring (1 concern per phase)
❌ **Don't** skip Phase 1 (unblocks everything)

✅ **Do** commit after each phase
✅ **Do** test thoroughly before moving to next phase
✅ **Do** measure performance with tools, not gut feeling
✅ **Do** keep phases small and isolated
✅ **Do** get PR review between phases

---

## File Checklist

### Phase 1
- [ ] `src/app/notes/page.tsx` - Consolidate
- [ ] `src/app/notes/[id]/page.tsx` - Delete/Merge
- [ ] `src/lib/notes/hooks/use-note-selectors.ts` - Create
- [ ] `src/lib/notes/hooks/use-tree-selectors.ts` - Create

### Phase 2
- [ ] `src/components/notes/navigation-sidebar.tsx` - Create
- [ ] `src/components/notes/ai-panel/index.tsx` - Create
- [ ] `src/components/notes/ai-panel/metadata-section.tsx` - Create
- [ ] `src/components/ui/modal.tsx` - Create
- [ ] `src/app/notes/page.tsx` - Update
- [ ] `src/components/notes/sidebar/sidebar.tsx` - Refactor
- [ ] `src/components/notes/search-modal.tsx` - Refactor
- [ ] `src/components/notes/trash-modal.tsx` - Refactor

### Phase 3
- [ ] `src/components/notes/sidebar/sidebar-list-item.tsx` - Memoize
- [ ] `src/components/notes/sidebar/sidebar-list.tsx` - Optimize
- [ ] `src/components/notes/note-nav.tsx` - Split
- [ ] `src/components/notes/search-modal.tsx` - Debounce

### Phase 4
- [ ] `src/styles/components/sidebar.css` - Create
- [ ] `src/app/globals.css` - Update
- [ ] All `src/components/notes/sidebar/*.tsx` - Update

### Phase 5
- [ ] `src/components/notes/sidebar/sidebar-list-item.tsx` - Add ARIA
- [ ] `src/components/ui/modal.tsx` - Add focus trap
- [ ] `src/components/notes/note-nav.tsx` - Add ARIA labels

---

## Success Criteria Checklist

### Phase 1 Complete ✓
- [ ] `/notes` route works
- [ ] `/notes/[id]` route works
- [ ] State selectors created and exported
- [ ] No visual changes

### Phase 2 Complete ✓
- [ ] 4-section layout visible
- [ ] All navigation working
- [ ] AI panel shows metadata
- [ ] Modals functional

### Phase 3 Complete ✓
- [ ] React DevTools shows 40-60% fewer renders
- [ ] Search debounce implemented
- [ ] Tree operations fast (<100ms)

### Phase 4 Complete ✓
- [ ] Consistent sidebar styling
- [ ] Both themes work
- [ ] No hardcoded colors in components

### Phase 5 Complete ✓
- [ ] ARIA labels present
- [ ] Keyboard navigation works
- [ ] Screen reader friendly

---

## Useful Links

- **React DevTools Profiler**: chrome://extensions → React DevTools → Profiler tab
- **axe DevTools**: https://www.deque.com/axe/devtools/
- **Tailwind Dark Mode**: https://tailwindcss.com/docs/dark-mode
- **Unstated-next**: https://github.com/jamiebuilds/unstated-next
- **React.memo**: https://react.dev/reference/react/memo

---

## Need Help?

**Stuck on Phase X?** Refer back to the full report: `REFACTORING_NOTES_LAYOUT.md`
**Performance tuning?** Use: `src/components/notes/` + React DevTools Profiler
**Styling questions?** Check: `tailwind.config.js` + `src/app/globals.css`
**State questions?** Check: `src/lib/notes/state/` files
