# Notes Refactor Plan

> AI Study Vault SRS-aligned refactor of the Notea-derived note-taking functionality.

## Context

The note editor is scaffolded from [Notea](https://github.com/QingWei-Li/notea) (MIT) and lives inside the SocsBoard repo. The **AI Study Vault SRS** is the governing spec. S3 storage and RAG are being built by teammates — this refactor focuses on getting Markdown note CRUD, tree, offline cache, and editor working cleanly so downstream features have a solid surface to connect to.

## SRS Requirements Mapping

| SRS Req | Description | Current Status |
|---------|-------------|----------------|
| **FR-4.1** | Split-pane editor with MD + live preview | Partially working (Lexical editor exists, split mode exists) |
| **FR-4.2** | MD syntax: headers, lists, code, tables, LaTeX | Lexical handles most, LaTeX missing |
| **FR-4.3** | Auto-save to IndexedDB every 5s while editing | Broken — mock router blocks saves |
| **FR-4.4** | Folder hierarchy (`/Math/Calculus/Week-3`) | Tree exists but mutations don't persist in API |
| **FR-4.5** | Sync to S3 when online (last-write-wins) | Not wired yet (teammate's domain), mock must simulate this pattern |
| **FR-9.1-9.6** | PWA offline-first with sync queue | LocalForage cache exists but no sync queue |
| **FR-15.1** | Arbitrary tags on notes | Not implemented |
| **FR-15.2** | Bidirectional `[[wiki-links]]` | Backlinks exist in cache layer but link extraction is fragile |
| **FR-15.3** | Display backlinks | `getBackLinks` exists but has debug `console.log` |
| **FR-14.1-14.4** | Cmd+K command palette search | Search modal exists, partially working |

## Bugs & Issues

### Critical (Blocks Functionality)

| # | Bug | File | Root Cause | Impact |
|---|-----|------|------------|--------|
| **C1** | Mock router in editor state | `state/editor.ts:55-60` | Hardcoded no-op object instead of `useRouter`/`useSearchParams` from `next/navigation` | Notes never save on first create; navigation after create does nothing; `saveNow` is a no-op |
| **C2** | API client uses POST for updates | `api/note.ts:36-48` | `mutate()` sends POST to `/api/notes/[id]` and `/api/notes/[id]/meta` | The actual route handler only has GET/PUT/DELETE. POST returns 405. Every note edit silently fails |
| **C3** | `/api/notes/[id]/meta` route doesn't exist | `api/note.ts:43-48` | Upstream Notea had separate content vs. metadata endpoints | 404 error on every metadata-only update (pin, delete flag, title) |
| **C4** | Trash API is a no-op | `api/trash/route.ts:27-43` | Only `console.log`, never touches mock storage | Restore/permanently delete appear to work but data doesn't change |
| **C5** | Tree POST mutation is a no-op | `api/tree/route.ts:10-15` | Returns `{ success: true }` without modifying tree | Move, expand/collapse, reorder all lost on reload |
| **C6** | Fetcher only supports GET/POST | `api/fetcher.ts:9` | `method: 'GET' | 'POST'` type union | Can't send PUT or DELETE from the client even after fixing routes |

### Moderate (Degraded UX / Performance)

| # | Issue | File | Impact |
|---|-------|------|--------|
| **M1** | `updateNote` and `mutateNote` are duplicates | `state/note.ts:60-97, 142-164` | Confusing API, different optimistic update paths, TODO comment from original Notea authors |
| **M2** | `searchNote` called twice in `filterNotes` | `state/search.ts:14-15` | Double search on every keystroke |
| **M3** | 9-level provider nesting | `providers.tsx:33-56` | Every state change re-renders all providers below it; `unstated-next` is unmaintained (last publish: 2019) |
| **M4** | `pinnedTree` runs `cloneDeep` on every tree change | `state/tree.ts:240` | Full deep clone of entire tree on every render cycle |
| **M5** | `fetchNotes` N+1 problem | `state/tree.ts:52-63` | On init, fires one API request per tree item in parallel |
| **M6** | `setItemsExpandState` fires sequential network requests | `state/tree.ts:200-208` | `for...of` loop with `await mutate()` inside — serializes what could be batched |
| **M7** | Cache has no TTL or invalidation | `cache/note.ts` | Stale data displayed until manual refresh |

### Minor (Code Quality)

| # | Issue | File |
|---|-------|------|
| **m1** | Chinese comments | `state/tree.ts:148`, `state/trash.ts:28`, `state/editor.ts:31`, `cache/note.ts:11` |
| **m2** | Debug `console.log(note?.id)` | `state/editor.ts:162` |
| **m3** | `any` types | `state/note.ts:72`, `portal.ts:45`, search results |
| **m4** | Lodash used where native equivalents exist | `isEmpty`, `map`, `has`, `forEach`, `keys`, `pull`, `cloneDeep`, `reduce` |
| **m5** | Dead `view` reference in portal state | `state/portal.ts:45` |

## State Management: unstated-next -> Zustand

| Factor | unstated-next | Zustand |
|--------|---------------|---------|
| Last npm publish | 2019 (6 years ago) | Active (weekly releases) |
| React 19 compat | Not tested | Officially supported |
| Next.js App Router | No SSR support | Built-in SSR support |
| Provider nesting | Required (9 levels deep) | Zero providers needed |
| Bundle size | 200B (but requires provider tree) | 1.2KB (standalone) |
| Devtools | None | Redux DevTools integration |
| Middleware | None | persist, immer, devtools |
| PWA/offline | Manual | `persist` middleware with IndexedDB adapter |

Zustand's `persist` middleware can use `localforage` as a storage adapter, giving offline state persistence for free (supports FR-9.3 and FR-4.3).

## Refactor Phases

### Phase 1: Foundation Fixes (Critical Bugs)

1. **Fix fetcher HTTP methods** — Expand `method` type to include PUT/PATCH/DELETE (`api/fetcher.ts:9`)
2. **Fix API client** — `mutate()` uses PUT `/api/notes/[id]` for all updates; remove dead `/meta` path (`api/note.ts`)
3. **Fix mock router** — Replace with `useRouter`/`useSearchParams`/`usePathname` from `next/navigation` (`state/editor.ts:55-60`)
4. **Implement trash API** — Make restore/delete actually mutate mock storage (`api/trash/route.ts`)
5. **Implement tree mutations** — Process `move`/`mutate` actions against mock tree storage (`api/tree/route.ts`)

### Phase 2: Zustand Migration

New store files (migration order based on dependency graph):

```
src/lib/notes/stores/
├── use-editor-mode-store.ts   # 1. standalone
├── use-portal-store.ts        # 2. standalone
├── use-ui-store.ts            # 3. standalone
├── use-search-store.ts        # 4. depends on noteCache
├── use-tree-store.ts          # 5. depends on API + cache
├── use-note-store.ts          # 6. depends on tree store + API + cache
├── use-trash-store.ts         # 7. depends on tree store + API + cache
├── use-editor-store.ts        # 8. depends on note store + portal + UI
└── index.ts                   # re-exports
```

- Delete `CsrfTokenState` entirely (pass-through that does nothing)
- Merge `updateNote` and `mutateNote` into single function with diff check
- Providers.tsx goes from 9 levels to just `I18nProvider` + `SnackbarProvider`

### Phase 3: Performance & SRS Alignment

- Fix N+1 fetching — return note data inline from tree GET, or add batch endpoint
- Fix double search in `filterNotes`
- Replace `cloneDeep` with `structuredClone`
- Batch expand/collapse mutations into single API call
- Add cache TTL via Zustand persist middleware `version` field
- Replace all lodash usage with native JS equivalents

### Phase 4: Code Quality

- Translate Chinese comments to English
- Remove debug `console.log` statements
- Fix `any` types with proper interfaces
- Remove dead imports and references
- Add `error.tsx` boundaries for note pages (NFR-U-6)

## Out of Scope

- S3 integration (teammate building this)
- RAG/embeddings (another teammate's domain)
- MariaDB/PostgreSQL (mock storage simulates persistence layer)
- Auth (separate concern, notes just need user ID)
- PWA service worker (Zustand persist + localforage provides cache layer)

## Dependency Changes

```diff
+ zustand              # state management replacement
- unstated-next        # removed after migration
- lodash               # removed (native replacements)
- @types/lodash        # removed
```

## Lodash Replacement Map

| Lodash | Native |
|--------|--------|
| `isEmpty(obj)` | `Object.keys(obj).length === 0` |
| `map(collection, fn)` | `Object.values(collection).map(fn)` or `array.map(fn)` |
| `forEach(obj, fn)` | `Object.entries(obj).forEach(...)` |
| `has(obj, key)` | `key in obj` |
| `cloneDeep(obj)` | `structuredClone(obj)` |
| `reduce(arr, fn, init)` | `arr.reduce(fn, init)` |
| `keys(obj)` | `Object.keys(obj)` |
| `pull(arr, ...vals)` | `arr.filter(x => !vals.includes(x))` |
