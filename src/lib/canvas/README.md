# Import and shared worker map

> Current code map, verified 2026-09-13.

This directory contains Canvas integration and import processing.
[`worker-entry.ts`](worker-entry.ts) also starts the shared Node worker for
Canvas work, chat generations, vault import and export, marketing cleanup,
and retention tasks.

## Entry points and ownership

- [`/api/canvas/import`](../../app/api/canvas/import/route.ts) starts and
  cancels Canvas imports. The other Canvas route entry points are beside it.
  [`/api/vault/import/start`](../../app/api/vault/import/start/route.ts) starts
  vault work. Vault export, status, cancellation, and deletion routes are in
  the same API directory.
- [`worker-entry.ts`](worker-entry.ts) starts queue consumers, recovery polls,
  periodic marketing cleanup, imported-file cache retention, and note lifecycle
  retention. It dispatches Canvas and vault messages through
  [`job-dispatch.ts`](job-dispatch.ts), and consumes chat work separately.
- [`import-worker.ts`](import-worker.ts) coordinates Canvas discovery, files,
  extraction retries, and Marker completion. [`import-cache.ts`](import-cache.ts)
  and [`import-cache-retention.ts`](import-cache-retention.ts) own shared
  imported-file cache reuse and cleanup.
- [`../vault/import-worker.ts`](../vault/import-worker.ts) and
  [`../vault/export-worker.ts`](../vault/export-worker.ts) own streaming vault
  jobs. Their storage and relational writes have job and attachment contracts,
  so they are not interchangeable with ordinary note creation.

Some specialized import paths still make direct note and tree writes, including
Canvas extraction and folder creation, vault import, and vault tree building.
Do not assume every imported note uses `notes/storage/create-note.ts`.

## Tests and runbooks

- [`canvas-job-dispatch.test.ts`](../../__tests__/lib/canvas-job-dispatch.test.ts)
  covers message validation and routing. [`canvas-import-worker.test.ts`](../../__tests__/lib/canvas-import-worker.test.ts)
  covers Canvas import orchestration.
- Vault worker tests are in
  [`vault/import-worker-persistence.test.ts`](../../__tests__/lib/vault/import-worker-persistence.test.ts) and
  [`vault/export-worker.test.ts`](../../__tests__/lib/vault/export-worker.test.ts).
- [Import pipeline](../../../docs/engineering/import-pipeline.md) owns stages
  and tuning. [Import worker](../../../docs/operations/import-worker.md) owns
  runtime operation. [Testing and verification](../../../docs/engineering/testing.md)
  owns local and CI commands.
