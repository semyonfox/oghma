# File-tree coordination review

> Status: Historical investigation and proposed plan, superseded by the working-tree implementation
>
> Reviewed: 2026-09-15
>
> Code reviewed: `f885c496`, branch `t3code/verify-file-tree-handover`

See [file-tree coordination](../engineering/file-tree-coordination.md) for the implemented architecture and current verification limits.

## Recommendation

Fix mutation identity and error handling first, then make reads, mutations,
and resets share explicit ownership. Preserve the lazy tree on ordinary
refresh and same-user remount. Remove unused browser tree persistence.
Prefer uncached tree reads before introducing a durable revision system.

The supplied `file-tree-coordination-reliability-handover.md` exists in the
main checkout at `/home/semyon/code/university/ct216-software-eng/oghmanotes/docs/engineering/`,
but is absent from this worktree. This review checked its claims against this
branch. Some Canvas publication and lifecycle code differs from main, so
recheck the eventual integration diff before implementation.

## Verified findings and corrections

| Finding | Evidence and consequence |
|---|---|
| Moves can target a sibling without any concurrency | `src/app/api/tree/route.ts:97` resolves identity by index in `getTreeFromPG`. That query uses SQL title order. `src/app/api/tree/children/route.ts` uses numeric natural ordering. The drop handler already has the stable dragged ID but converts it into a position. |
| Failed moves usually remain optimistic | `src/lib/notes/api/fetcher.ts:55` catches HTTP errors and returns undefined. `useTreeAPI` passes that through. The store does not require a successful response, so its rollback catch normally never runs for HTTP failures. Repairing propagation alone would expose the whole-tree rollback race. |
| The empty-tree constant is mutable shared state | `src/lib/notes/state/tree.ts:121` copies the items map but shares its root object; line 129 changes `DEFAULT_TREE.items.root.children`. A reset must construct fresh objects. |
| Refresh can acknowledge work it did not do | `refreshTree` calls `initTree`, which returns early during loading. `refreshChildren` returns early during lazy loading, or joins a refresh started before a newer publication. No dirty rerun is guaranteed. |
| Old work is not fenced | Root and child responses lack session/generation guards. A late child response can insert objects even if its parent disappeared. Path refreshes can continue issuing deeper requests after a reset. |
| Clear Vault leaves the client stale | `src/components/settings/danger-section.tsx` only toasts after DELETE `/api/vault`. It does not reset tree, active notes, panes, or browser note cache. |
| Pin persistence is missing | The note update schema accepts `pinned` and the client sends it, but `src/app/api/notes/[id]/route.ts` only updates title, content, and updated_at. Calling this solely a cache invalidation problem understates the defect. |
| Rename can repopulate old sidebar metadata | The note update route invalidates the full tree but not the containing child-list cache. Child-list cache fills also lack protection against read-before-write/invalidate-before-fill races. |
| Detached state survives branch replacement | `refreshChildren` replaces a child list but retains old objects. Filtering selection by object existence does not establish reachability. The adapter forwards expansion, selection, and focus to React Complex Tree. |
| GET deduplication has lifecycle gaps | `request-deduplicator.ts` keys only by method and URL. Clearing the map does not cancel old requests, and an old request's finally can delete a newer entry. The fetcher's abort method only tracks its last controller. |
| Duplicate Canvas publication ownership exists | `CanvasImportNotifications` already exposes context, but the settings import hook separately polls and refreshes. Pending paths are cleared before the store proves they were applied. |

The normal settings logout performs a full navigation to `/login`, and login
uses `location.replace('/notes')`. A routine account switch leaking singleton
state was not reproduced. Explicit session ownership is still needed for
in-flight work, Clear Vault, auth invalidation, and persistent caches; do not
claim a demonstrated cross-account exposure from the singleton alone.

## Opus 5 comparison

Two bounded read-only Claude CLI passes used `claude-opus-5`; CLI metadata
confirmed that model. The first received the handover and relevant code. The
second received concrete local findings and objections to its first proposal.

Kept from Opus: explicit fetch errors first, canonical parent results,
reconciliation instead of snapshot rollback, same-user remount preservation,
removing unused tree persistence, and deferring a durable revision framework.

Challenged and revised together: request sequence alone does not fence local
mutations; object-existence filtering does not prune detached view state;
focus-only refresh misses another visible tab; a post-commit Redis epoch does
not close the crash gap. Opus accepted these corrections in its second pass.
Use parent tokens and same-item queues rather than adding redundant mutation
version machinery. Retain reachability cleanup and cross-tab invalidation.

I did not retain its suggestion to fix SQL full-tree sorting as a prerequisite
for stable identity. Once moves use IDs, that full-tree reader has no remaining
production caller in this branch. Share the natural comparator where it remains
necessary for child responses and optimistic display.

## Implementation sequence

### 1. Make writes truthful

- Give tree requests explicit success/error results and per-request cancellation.
  Preserve existing shared-fetcher caller contracts unless those callers are
  audited; do not globally change error behavior as an incidental refactor.
- Send `noteId`, destination parent, and expected source parent. Validate the
  exact row and expected parent inside the existing move transaction. Return
  canonical old/new parents. Resolve stale-parent conflicts with 409.
- Remove whole-tree rollback. Reconcile affected parents after success or
  failure, including ambiguous failures where the server may have committed.
  Keep a retry/error state if reconciliation itself fails.
- Serialize moves of the same item and invalidate reads of affected parents
  at mutation start and settlement. Reconciliation must respect other pending
  optimistic moves on those branches.
- Fix pin persistence and add endpoint behavior coverage.

### 2. Give the tree one lifecycle contract

- Construct a fresh empty tree; store owner user ID and a client generation.
- Guard requests, apply steps, finally cleanup, delayed callbacks, mutation
  settlement, and each depth of a path refresh against that generation.
- Share per-parent request ownership between lazy loads and refreshes. Mark a
  branch dirty when invalidated during a request, rerun after it settles, and
  acknowledge publication only after the required read applies.
- Isolate GET deduplication by request owner/generation or bypass it for these
  coordinated reads. Use identity-checked cleanup and cancel all owned requests.
- Preserve state on same-user remount. Cancel/detach obsolete dependencies
  without treating every workspace unmount as logout.
- Reset tree, relevant note caches, pane references, view state, and publication
  work on user change, logout/auth invalidation, or confirmed Clear Vault.
  Coordinate late note responses and autosaves too; tree-only reset is insufficient.
- Remove unused browser tree snapshot writes and evict the old tree key.
  Keep actual note/offline caches, with their own account/deletion handling.

### 3. Reconcile without surprise collapse

- Refresh root and relevant loaded branches, preserving valid descendants and
  the open note. Keep the current display on a failed read and report failure.
- Reconcile related parent snapshots together when moving items. Ensure one
  reachable parent per item; stale responses must not steal it back.
- Prune detached graph objects and sanitize view state at coordinated apply
  boundaries, accounting for pending mutations. Do not equate an unloaded
  branch with a deleted note. Check note availability before closing an editor.
- Keep natural title ordering. Remove the UI promise of manual sibling ordering;
  retain drag-to-folder moves and between-folder targeting where meaningful.

### 4. Simplify publication and cache correctness

- Reuse the existing Canvas context as the status owner. Retain start/cancel
  actions in settings, but remove its independent polling/publication loop.
- Retain job identity fencing, bounded retry, and application acknowledgement.
  Implement these in the existing hook/store; no new event-processing framework.
- Prefer removing tree snapshot caches. Measure uncached branch queries on a
  representative disposable dataset before release. If performance requires
  caching, design transactionally maintained revisions separately. A Redis
  counter incremented after commit still has a crash gap and requires all writers.
- Use user-scoped BroadcastChannel invalidations with a storage fallback for
  ordinary writes and Clear Vault. Send IDs/invalidation metadata, not content.
  Revalidate on focus/visibility return even if no broadcast was observed.
  This covers same-browser tabs, not instantaneous cross-device synchronization.

## Validation

Executed on this branch:

- Locked dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund`.
- Seven focused existing files passed, 55 tests: tree loading, tree mutations,
  tree children, Canvas status, settings Canvas import, PG moves, and tree actions.
- Three temporary tests reproduced shared DEFAULT_TREE mutation, refresh resolving
  while startup remains pending, and undefined move responses leaving optimistic
  state applied. These assert the defects, not correct behavior. They were removed
  from the worktree after execution; a copy is at `/tmp/file-tree-review-repro.test.ts`.

Implementation must turn those into regression tests for correct behavior and
add stale-index/order, late response, concurrent move, publication retry, session
change, Clear Vault, two-tab, and pin-persistence coverage. Include a real HTTP
failure path; mocked rejecting APIs alone miss the current fetcher defect.

During this investigation, no app changes, live imports, browser/worker interruptions, migrations, service
restarts, or production checks were performed. Full lint/typecheck/build are
implementation release gates, not evidence produced by this read-only review.

## Decisions for Semyon

No blocking product decision is needed with these defaults:

- Keep natural title sorting, refresh without collapse, and same-user remount state.
- Reject a stale move with a conflict and refresh rather than silently overriding
  another tab's reparenting.
- Keep existing expansion persistence behavior during this reliability work;
  clean up duplicate expansion representations without inventing new semantics.
- Remove unused tree persistence; measure before retaining server tree caches.

Only override these if manual sibling ordering, last-write-wins moves, or
instantaneous cross-device updates are intended product requirements. Those
would expand this plan.
