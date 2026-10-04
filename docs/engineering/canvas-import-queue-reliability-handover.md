# Canvas import reliability handover

> Status: Implemented locally, deployment and live rollout unverified
>
> Reviewed: 2026-09-15
>
> Scope: Canvas imports, discovery, extraction retries, shared PDF reuse

## Decisions

- Repeating the same active import request returns its existing run. Course order and duplicate selections do not create new work.
- Changing the selected courses or switching between import and manual sync requires explicit replacement of the observed active job ID. A stale confirmation cannot cancel a newer run.
- Stop targets that same observed job. Completed notes stay available. Already submitted external OCR or storage requests may finish, but a stopped execution cannot publish new user-visible results.
- Retry failed files creates a new run containing only retryable failures. Completed files stay attached to their original run, whose summary is retained.
- Pause/resume remains deferred. It needs durable discovery cursors, explicit paused ownership, bounded external work, retention rules, and tests for every state transition before the UI can promise it.

## Why it can be slow

Discovery respects Canvas request costs and bounds nested requests. The fair scheduler admits one initial file per user at a time. That is an initial-dispatch rule, not a guarantee that all OCR, Marker callbacks, and retries are serial for that user. Raising concurrency before measuring provider throttling can make imports slower.

Discovery now reports courses checked, the current resource stage, and files found. It does not invent a percentage while the total is unknown. File completion counts indexed results; indexing itself is still work in progress. Settings and the global indicator use the same bounded polling interval and share simultaneous status requests.

A folder in Trash remains a deletion boundary. A new manual import checks the selected courses for affected Trash bundles before creating or replacing a run. It offers Restore and import, Keep in Trash, or Cancel. Restoration uses the existing Trash operation and preserves note IDs, content, and edits. The dialog names the whole bundle because restoring a folder includes its contents. An observed deletion timestamp prevents an old confirmation from restoring a newer deletion. Identical active requests still reuse the run without a new restore operation.

Automatic sync never restores folders. A trashed course skips that course; a trashed module or assignment skips only that part. Discovery remembers skipped attachment/file IDs so the flat Files inventory cannot reimport them elsewhere. The summary lists skipped folders. A missing local parent raises a distinct error rather than falsely calling it Trash. A permanently purged folder can be created on later discovery when no existing identity remains; the importer does not recreate a missing parent behind an existing tree reference.

## Ownership and recovery

Migration [067](../../database/migrations/067_canvas_execution_ownership.sql) adds execution tokens, expiry, attempt counters, durable retry sequence/due time, request identity, discovery progress, and shared-cache producer identity.

Discovery and initial/retry file processing acquire an execution token and renew a five-minute lease every 30 seconds. Publication checks the token while holding the existing user-tree lock and the owning job/file rows. Nested SQL helpers share that transaction. Recovery and Stop therefore either wait for an accepted publication or prevent it from starting. An old worker cannot resume and overwrite the successor's note state.

Recovery handles abandoned active files, abandoned discovery, legacy stranded children, and retry budgets. It observes by default. The worker only applies it when `CANVAS_CLAIM_RECOVERY=enabled`. A durable poll repairs queue-send loss; delayed retry deliveries must match the stored sequence and due time. Provider retry counters cannot reset the database attempt budget.

External object/vector writes cannot roll back with PostgreSQL. Immutable object keys make repeated original-file writes safe. Old vectors are deleted after commit, and rollback cleanup removes newly written vectors. Existing deletion and vector-cleanup paths remain necessary if an external cleanup request itself fails. Long publication calls also hold the user-tree lock and can delay Stop until the current bounded request returns.

## Shared immutable PDF reuse

The intended model is implemented for PDFs:

1. Verify the current user's access through Canvas metadata.
2. Reuse a verified ready source locator, or download and hash the bytes with SHA-256.
3. Under a short database lock, select one producer for that hash and pipeline version. Concurrent first-time importers become durable `pending_cache` waiters.
4. The producer extracts and embeds once. Its pending retry or asynchronous Marker job keeps ownership while the parent run remains active.
5. Capture the canonical result before user edits can change it. Ready cache content is immutable.
6. Each consumer gets its own editable note, attachment, tree/provenance records, and user-filtered search records. These reference the shared original and reuse extraction/embedding output.

Two users may both download a previously unseen file to establish its hash. Sharing avoids duplicate extraction and embedding for a live producer; it does not promise one network download, global sharing for every MIME type, or exactly-once external OCR after a producer crashes. Failed/cancelled owners can be replaced. Waiters do not spend their processing attempt budget while waiting.

The canonical cache and its deletion rules are described in [Import pipeline](import-pipeline.md). Do not treat filenames or course IDs as content identity. Do not capture later user edits back into the canonical result.

## Release gates

1. On the target database, run the read-only duplicate-active-job preflight in the [worker runbook](../operations/import-worker.md#canvas-claim-recovery-rollout). Resolve any rows before migration 067; its unique index deliberately refuses inconsistent state.
2. Apply the additive migration and deploy compatible API and worker code with recovery left in observation mode. Replace all old writers before enabling recovery. The normal deployment path remains owned by the homelab runbook.
3. Verify claim renewals, observed stale candidates, queue dispatch, Marker completion, explicit replacement, and Stop in the development environment.
4. Enable recovery in development. Kill a worker during download, indexing, and discovery; verify bounded recovery and rejection of the old execution's writes. Exercise delayed/duplicate retry messages and two first-time users importing the same PDF.
5. Verify real browser progress, partial-result publication, Trash guidance, retry-only-failures, and stale confirmation behavior. Local component tests do not replace this deployed browser check.
6. Roll out production only after development evidence is recorded. Disabling recovery stops reclamation; it does not make rolling back to an old writer safe. Keep compatible writers until active work is drained and the rollback is reviewed.

## Local evidence

Local checks passed on 2026-09-15:

- `npm run test:ci`: 1,484 root tests and 186 standalone MCP tests.
- `tests/integration/canvas/reliability.test.ts`: 21 tests against disposable PostgreSQL 16.
- `npm run lint`, `npm run typecheck`, `npm run i18n:audit`, and `npm run build`.
- Local Markdown links and `git diff --check`.

The disposable PostgreSQL integration suite uses the real schema and migrations, including 067. It covers concurrent starts, replacement identity, expired claims in each active file stage, publication versus reclamation, rollback of nested writes, killed subprocess recovery, discovery recovery, legacy stranded children, stale/early retries, failed-file retry runs, simultaneous first-time PDF reuse with separate user notes, and rollback after indexing with old vectors preserved and new vectors cleaned. Storage, queue, OCR, and vector services are mocked in that suite.

Unit/component checks cover status completion counts, terminal partial results, shared polling, and the nested Trash discovery regression. The standard typecheck, root/MCP tests, lint, locale audit, and production build are release prerequisites. Local validation does not establish live provider behavior or authorize deployment.

## Separate follow-up

Vault and optional Cloudflare queue lifecycle risks remain a separate scope. Check actual provider visibility, redelivery, dead-letter, and worker shutdown behavior before changing queue policy. The checked-in Cloudflare bootstrap uses a finite provider retry default; do not describe it as proven infinite retry. Do not fold a queue-provider rewrite or a full pause system into this recovery rollout.
