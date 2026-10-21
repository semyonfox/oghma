# File-tree coordination

> Status: Current implementation. Tree coordination is on `dev` and `main`;
> the restore-placement rule and the single-note cache removal reached `dev`
> on 2026-10-16 (#633)
>
> Last reviewed: 2026-10-16
>
> Source of truth for: Browser tree ordering, reconciliation, session reset,
> and import publication ownership

## Design

PostgreSQL owns note identity and parent relationships. The browser holds a
lazy projection in the existing Zustand tree store. One queue in that store
orders tree reads, expansion writes, and moves.

A move waits for the server. The request names the note, its expected parent,
and its destination. The server checks those rows inside the existing locked
transaction and returns the actual parents. A changed expected parent returns
409. The browser then reads the affected branches. It never restores an older
whole-tree snapshot.

This removes the need for optimistic move patches, rollback versions, a new
state library, or a durable tree revision migration. The cost is that the item
stays in its current position during the request and shows a busy indicator.
It cannot be dragged again until the move settles. Siblings retain natural
title ordering; manual ordering is not persisted or offered.

## Reads and refresh

- The tree API validates responses and throws on failure. Its requests bypass
  the shared URL-based GET deduplicator and accept an operation-owned signal.
- The queue combines equivalent waiting reads. A refresh requested after a
  read has started gets a later read, so it cannot acknowledge an older snapshot.
- Each operation captures the tree generation. Reset aborts active requests;
  generation checks also reject late responses, queued commands, cleanup, and
  subsequent depths of a publication path.
- A reconciliation builds its result off-screen, fetching at most six independent
  folders together, then updates the graph and view state once. If committed
  note CRUD changes the local tree during the read, the operation rereads before
  applying its result. After three conflicting batches it fails, preserves the
  newer local writes, and releases the queue for subsequent work.
- Normal refresh reads root and previously loaded or expanded folders. Valid
  descendants survive. Failed reads retain the previous display and report an
  error. Reset is a separate operation and constructs fresh empty-tree objects.
- Branch replacement updates parent identity, removes duplicate incoming edges,
  and prunes unreachable objects at the batch boundary. Selection, focus,
  rename, and expansion refer only to reachable items. Sidebar reachability
  alone does not decide whether an independently open note was deleted.

Tree child responses and single-note reads come straight from PostgreSQL.
Nothing reads a Redis copy of notes, tree branches or note lists any more; the
single-note cache was removed after it served stale content following
extraction and import writes. `tree-cache.ts` still deletes the old keys after
imports publish, which is harmless. The old five-minute tree cache could
be repopulated by a stale read after invalidation. This implementation
makes no claim about measured production database load; measure representative
uncached branch latency before adding caching back. A post-commit Redis counter
would still leave a crash gap. If caching becomes necessary, its consistency
contract needs its own design and transaction coverage.

## Workspace lifecycle

A root workspace provider resolves the authenticated owner before initializing
the notes workspace. Same-user remounts retain the tree. Owner transitions,
logout, and Clear Vault reset the tree, note store, pane references, and relevant
browser caches. Normal same-account reloads preserve saved drafts.

Browsers upgraded from the unscoped cache format have no trustworthy owner.
Before opening the workspace, the lifecycle copies their note values to
`legacy-unowned-note:<note-id>` and draft values to
`legacy-unowned-draft:<note-id>` in the `oghma-ui` IndexedDB `data` store. It
then clears the live note and draft keys. Existing quarantine values are never
overwritten, and a failed copy leaves the live caches blocked and intact for a
retry. There is no recovery UI yet. Pane metadata is not quarantined because it
contains no unsaved note data and cannot establish ownership.

Workspace operations use generations to prevent late note responses or saves
from repopulating erased state. Session cleanup evicts the unused browser tree
snapshot. The server returns 503 for an authentication-profile backend failure,
so a service outage is not treated as a confirmed logout.

Other tabs receive user-scoped invalidation messages through BroadcastChannel
and a storage-event fallback. Messages contain IDs and invalidation metadata,
not note titles or content. A receiving tab reads its own current server state.
A tab acknowledges an invalidation only after its handler succeeds; failed
deliveries can retry on focus. Focus and visibility restoration also revalidate,
covering missed messages.
This is same-browser coordination, not a server push protocol across devices.

## Restore placement

Restoring a Trash bundle puts its root back under its original folder only if
that folder is still a live folder owned by the user. Otherwise the root goes to
the workspace root, and it stays there if the original folder is restored
later. Before this rule a restored note could point at a trashed folder and
never appear in the sidebar.

## Canvas publication

The existing Canvas provider is the sole polling and publication owner across
notes and settings. Settings consumes its state and retains start, sync, replacement confirmation,
Trash recovery, failed-file retry, and job-specific Stop actions. Server responses
control the polling interval. Public and unauthenticated pages do not poll.

Publication paths remain pending until the tree store applies the requested
reads. Failed requests retain their paths for retry. Job, mount, session, and
reset checks fence delayed callbacks and automatic sync. Terminal acknowledgement
waits for all live published notes to have resolved paths, the tree to apply
those paths, and forced-fresh open-note reads. The status API reports a count
so a legitimate empty job can complete without hiding unresolved paths. Fresh note reads bypass
request deduplication and invalidate older reads so pre-import content cannot
win after publication.

## Document bundles

Extraction places each PDF in a folder named after it, next to the extracted
`.md`. `/api/tree/children` marks such a folder with
`bundle: { pdfId, noteId }` only when it holds exactly one live PDF named
`<folder>.pdf` and at most one live `<folder>.md`, and nothing else. A renamed
companion or any extra child leaves it an ordinary folder. The sidebar shows a
bundle as one document row. Clicking it opens the note in pane A and the PDF in
pane B on desktop, or the PDF alone while extraction is still running. The
chevron still expands the real folder, and moves and deletes act on the folder
as before. Rows also drop `.md` and show other extensions muted.

## Main files

| Concern | Owner |
|---|---|
| Queue, generations, refresh, moves | `src/lib/notes/state/tree.ts` |
| Branch replacement and reachable graph | `src/lib/notes/state/tree-utils.ts` |
| Tree HTTP validation and cancellation | `src/lib/notes/api/tree.ts` |
| Stable move request and locked storage | `src/app/api/tree/route.ts`, `src/lib/notes/storage/pg-tree.ts` |
| Uncached child snapshots | `src/app/api/tree/children/route.ts` |
| Session identity and tab updates | `src/components/providers/workspace-lifecycle-provider.tsx` |
| Reset and browser cache ownership | `src/lib/notes/workspace-lifecycle.ts` |
| Cross-tab messages | `src/lib/notes/workspace-invalidation.ts` |
| Canvas status and acknowledgement | `src/lib/hooks/use-canvas-import-status.ts` |

## Verification and limits

Regression coverage includes wrong-index move identity, expected-parent
conflicts, pin persistence, refresh during bootstrap/lazy loading, local writes
during reads, generation resets, ambiguous move failure, subtree preservation,
rapid expansion changes, malformed HTTP responses, publication retries, and
session/cache ownership.

Final local checks passed: `npm run lint:all`, including ESLint, the 12-locale
audit, both typechecks, 1,572 app tests, and 186 Canvas MCP tests. The production
build passed with the CI placeholder configuration. `git diff --check` passed.

No live import, production cache load benchmark, or controlled worker
interruption was performed. See
[testing](testing.md) for disposable-service and browser release checks.
