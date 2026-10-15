# Notes map

> Current code map, verified 2026-10-16.

This directory owns note-focused client state, API helpers, relational storage
helpers, and note lifecycle code. PostgreSQL owns notes and tree rows. There is
no server-side Redis copy of notes, child lists, or the tree: workers write
note rows directly, so every read goes to PostgreSQL.

## Entry points and ownership

- [`POST /api/notes`](../../app/api/notes/route.ts) creates notes and folders.
  `GET /api/notes` lists note metadata with cursor or offset paging.
- [`/api/notes/[id]`](../../app/api/notes/[id]/route.ts) owns reads, updates,
  and Trash requests. PUT/PATCH lock the row, refuse a stale `expectedUpdatedAt`
  with 409, update only the fields the body names, then refresh the link index
  and queue a worker reindex when content changed.
  [`note-limits.ts`](note-limits.ts) holds the title, content, and body caps.
- `/api/notes/[id]/assets`, `/backlinks`, `/offline`, and `/share` serve Marker
  images, link lists, the mobile offline snapshot, and the API-only clone.
- [`/api/tree`](../../app/api/tree/route.ts) persists expansion and moves;
  [`/api/tree/children`](../../app/api/tree/children/route.ts) reads one branch.
- [`/api/trash`](../../app/api/trash/route.ts) lists, restores, and deletes
  whole Trash bundles.
- [`storage/create-note.ts`](storage/create-note.ts) owns the transaction that
  inserts a note and its sole tree row. `createNoteWithTree` takes the user-tree
  advisory lock before validating that the parent is an active folder owned
  by the same user. `insertNoteWithTree` joins a caller's transaction when
  related rows must commit together.
- [`storage/pg-tree.ts`](storage/pg-tree.ts) owns moves (same lock, cycle and
  expected-parent checks) and expansion writes.
- [`storage/note-lifecycle.ts`](storage/note-lifecycle.ts) owns Trash bundles,
  restore, permanent-deletion cleanup tasks, retention purge, and Clear Vault
  storage cleanup. A restored bundle whose original folder is not a live folder
  goes to the workspace root.

`POST /api/notes` delegates insertion to `createNoteWithTree` and maps
`InvalidNoteParentError` to its existing 404 response. Defaults and optimistic
note IDs belong to the route; storage receives explicit values. Both note and
tree rows commit together or roll back on failure.

Import flows also create notes, but they have extra durable work and do not all
share one create path. See the [import and worker map](../canvas/README.md)
before changing an import write.

## Browser state

- [`state/tree.ts`](state/tree.ts) is the lazy sidebar projection and its
  operation queue; see [file-tree coordination](../../../docs/engineering/file-tree-coordination.md).
- [`state/note.ts`](state/note.ts) fetches and saves notes, fencing late reads
  with per-note write versions and the workspace generation.
- [`state/layout.ts`](state/layout.ts) holds panes, panel sizes, and the
  active inspector tab (persisted to localStorage).
- `state/sync-status.ts`, `state/save-indicator.ts`, `state/context-menu.ts`,
  and `state/portal.ts` (the internal-link hover preview) are small UI stores.
- [`cache/`](cache/) wraps IndexedDB (`oghma-notes` for note bodies, `oghma-ui`
  for drafts) and [`pdf-cache/`](pdf-cache/) keeps downloaded PDF bytes.
  [`workspace-lifecycle.ts`](workspace-lifecycle.ts) clears all three on an
  owner change, and [`workspace-invalidation.ts`](workspace-invalidation.ts)
  tells other tabs to reread.

Other stores in `state/` (assignments, calendar, courses, pomodoro, quiz,
`ui/settings`) belong to their own features.

## Tests and runbooks

- [`note-create.test.ts`](../../__tests__/api/note-create.test.ts) covers the
  creation API contract. [`notes.test.ts`](../../__tests__/api/notes.test.ts)
  covers list, read, update (including the rename/autosave race), and Trash
  requests.
- [`create-note.test.ts`](../../__tests__/lib/notes/create-note.test.ts) covers
  the shared create helper. Lifecycle and tree tests sit beside it.
- The [database tests](../../../tests/integration/db/) cover parent ownership,
  atomic writes, duplicate IDs, the Trash lock race, move cycles, restore
  placement, and permanent deletion against the real schema.
- [`auth-notes.spec.ts`](../../../tests/e2e/smoke/auth-notes.spec.ts) covers the
  browser note flow.
- [Testing and verification](../../../docs/engineering/testing.md) owns local
  and CI commands. [Architecture](../../../docs/engineering/architecture.md)
  owns the cross-service data model.
