# Notes map

> Current code map, verified 2026-09-13.

This directory owns note-focused client state, API helpers, relational storage
helpers, and note lifecycle code. PostgreSQL owns notes and tree rows. The
cache only accelerates reads and must be invalidated after a change.

## Entry points and ownership

- [`POST /api/notes`](../../app/api/notes/route.ts) creates notes and folders.
  The route owns request validation, response and error mapping, link indexing,
  and cache invalidation.
- [`/api/notes/[id]`](../../app/api/notes/[id]/route.ts) owns reads, updates,
  and deletion requests. PUT/PATCH still coordinate database updates, cache
  invalidation, link indexing, text processing, and embeddings in the route.
- [`storage/create-note.ts`](storage/create-note.ts) owns the transaction that
  inserts a note and its sole tree row. `createNoteWithTree` takes the user-tree
  advisory lock before validating that the parent is an active folder owned
  by the same user. `insertNoteWithTree` joins a caller's transaction when
  related rows must commit together.
- [`storage/note-lifecycle.ts`](storage/note-lifecycle.ts) owns Trash,
  restore, permanent-deletion cleanup, and related cache invalidation.
- [`state/`](state/) holds browser state for the editor, tree, layout, Trash,
  and other notes workspace UI. [`api/`](api/) contains browser request helpers.

`POST /api/notes` delegates insertion to `createNoteWithTree` and maps
`InvalidNoteParentError` to its existing 404 response. Defaults and optimistic
note IDs belong to the route; storage receives explicit values. Both note and
tree rows commit together or roll back on failure.

Import flows also create notes, but they have extra durable work and do not all
share one create path. See the [import and worker map](../canvas/README.md)
before changing an import write.

## Tests and runbooks

- [`note-create.test.ts`](../../__tests__/api/note-create.test.ts) covers the
  creation API contract. [`notes.test.ts`](../../__tests__/api/notes.test.ts)
  covers list, read, update, and Trash requests.
- [`create-note.test.ts`](../../__tests__/lib/notes/create-note.test.ts) covers
  the shared create helper. Lifecycle and tree tests sit beside it.
- The [database creation tests](../../../tests/integration/db/create-note.test.ts)
  cover parent ownership, atomic writes, duplicate IDs, and the Trash lock race.
- [`auth-notes.spec.ts`](../../../tests/e2e/smoke/auth-notes.spec.ts) covers the
  browser note flow.
- [Testing and verification](../../../docs/engineering/testing.md) owns local
  and CI commands. [Architecture](../../../docs/engineering/architecture.md)
  owns the cross-service data model.
