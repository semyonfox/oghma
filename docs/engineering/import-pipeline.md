# Import Pipeline

> **Status:** Active engineering overview
>
> **Last reviewed:** 2026-07-17
>
> **Source of truth:** [`src/lib/queue.ts`](../../src/lib/queue.ts), [`src/lib/canvas/worker-entry.ts`](../../src/lib/canvas/worker-entry.ts), and the import workers

This page explains the shared background-processing shape for Canvas, direct
upload/extraction, and vault jobs. Deployment actions, exact environment queue
names, tuning values, and live troubleshooting belong in the
[`import-worker` operations runbook](../operations/import-worker.md).

## End-to-end flow

1. An API validates the user, creates relational job/import rows, and submits a typed message through the queue facade.
2. The worker consumes the message and, for Canvas, discovers courses/modules/files before fanning out per-file work.
3. Files are downloaded and deduplicated, note/tree rows are created, and binary objects are stored through the S3-compatible provider.
4. Extraction uses supported text parsers and optional Marker OCR. Extraction coverage records whether the result is partial.
5. Text is normalized, chunked, and embedded. Chunk text stays in PostgreSQL; vectors are upserted to Qdrant.
6. Job and per-file status rows drive UI progress. Extraction failures re-enter the shared import lane after a delayed retry backoff.

Files can appear before semantic indexing completes. Product copy must distinguish visible material from search/chat-ready material.

## Content-addressed PDF reuse

Canvas PDFs use two cache layers. A verified source locator combines the
institution domain, Canvas file ID, `updated_at`, byte size, and MIME type. A
ready locator hit may skip the binary download after the current user has
independently retrieved that file's metadata through Canvas. Missing or changed
version metadata always falls back to download. The downloaded bytes are keyed
by SHA-256, which remains the authoritative identity. Course names and
filenames are provenance, never identity. Canvas's documented File object does
not expose a content checksum, so previously unseen or changed locators must be
downloaded once.

The cache owns the immutable PDF object, pipeline-versioned extracted
Markdown, Marker image assets, chunks, and one canonical vector set. Each user
still owns separate note, attachment, tree, Canvas provenance, annotation, and
search rows. User-scoped Qdrant points are populated from cached vectors rather
than rerunning embedding inference; this preserves existing user filters and
prevents cross-user retrieval.

Permanent note deletion removes the user's references only. It must never
delete an `imports/shared/` object. Shared-object garbage collection is a
separate reference-aware retention operation. Sharing a cached document adds a
new user-owned note reference; annotations remain private unless a future
explicit annotation-sharing action is introduced.

`IMPORT_PIPELINE_VERSION` invalidates derived artifacts when extraction,
chunking, Marker policy, or embedding compatibility changes. Operators should
set it explicitly during such a rollout; otherwise it defaults to the selected
embedding model plus the current cache format version.

## Queue providers

[`src/lib/queue.ts`](../../src/lib/queue.ts) owns the provider switch:

- **BullMQ** is the default and current homelab provider. New work, including delayed extraction retries, uses the environment-prefixed `canvas-import` queue. The `extract-retry` consumer remains temporarily for messages created before the fairness rollout.
- **Cloudflare Queues** is implemented as an alternate HTTP publish/pull provider selected by `QUEUE_PROVIDER=cloudflare`. It is the target migration path, not the assumed live value.
- The same Node worker dispatches both providers and retains a PostgreSQL
  poller that reclaims Canvas import/sync discovery jobs whose enqueue was
  lost. It cannot reconstruct arbitrary direct-extraction, retry, or vault
  payloads.

Default BullMQ jobs use three attempts with exponential backoff. Vault import
and export enqueue sites override this to one attempt; in particular, a
partial vault-import retry is not yet idempotent and can create duplicate
notes.

Canvas discovery does not fan every file directly into the provider queue.
Pending files pass through a provider-neutral scheduler using smooth weighted
round robin across `free`, `semester`, and `academic_year` service classes with
weights 1:3:5. Within a class, the least-recently served eligible user goes
next, and each user has at most one dispatched file at a time. This preserves a
paid queue advantage without allowing one large import or one class to starve
the rest. `app.login.import_service_class` is local entitlement state and
defaults to `free`.

## Concurrency and timing

Code fallbacks, committed template values, and private live values are
different concepts. The operations runbook owns the verified comparison and
tuning procedure; do not copy that table into engineering overviews.

Throughput depends on document shape, OCR availability, provider limits, CPU,
storage latency, queue pressure, and GPU capacity. Retry timing and concurrency
changes are operational changes even when they require only an environment
variable.

## Reliability boundaries

- Canvas per-file claims and terminal-state checks reduce duplicate mutation.
- The worker marks long-running `processing`/`discovering` jobs failed after
  its stuck threshold and periodically re-enqueues orphaned Canvas discovery
  jobs.
- Vault jobs persist progress and support cooperative cancellation between files.
- Marker page ranges produce explicit extraction-coverage metadata, but there is no automatic full-document enrichment pass after a successful partial preview.
- `MARKER_OCR_ENABLED=false` bypasses Marker even when `MARKER_API_URL` is configured. `pdf-parse` remains a text-layer fallback, not OCR, so scanned PDFs will not become searchable while OCR is disabled.
- Qdrant updates go through [`src/lib/rag/indexing.ts`](../../src/lib/rag/indexing.ts), keeping vector-provider details out of the import stages.

## Important implementation files

| File | Responsibility |
|---|---|
| [`src/lib/queue.ts`](../../src/lib/queue.ts) | Queue-provider facade, naming, publish/pull/ack, and BullMQ defaults |
| [`src/lib/canvas/worker-entry.ts`](../../src/lib/canvas/worker-entry.ts) | Worker lifecycle, provider consumers, dispatch, and DB safety net |
| [`src/lib/canvas/import-worker.ts`](../../src/lib/canvas/import-worker.ts) | Canvas job orchestration and worker exports |
| [`src/lib/canvas/import-discovery.js`](../../src/lib/canvas/import-discovery.js) | Canvas hierarchy discovery and per-file fan-out |
| [`src/lib/canvas/import-extraction.js`](../../src/lib/canvas/import-extraction.js) | Download, dedupe/claim, note creation, timeouts, and retry handlers |
| [`src/lib/canvas/import-cache.ts`](../../src/lib/canvas/import-cache.ts) | Content hashing, shared artifacts, cached vector reuse, and ownership guards |
| [`src/lib/canvas/import-embedding.js`](../../src/lib/canvas/import-embedding.js) | Extraction, chunking, embedding, and Qdrant indexing handoff |
| [`src/lib/canvas/extraction-retry.ts`](../../src/lib/canvas/extraction-retry.ts) | Delayed retry schedule |
| [`src/lib/vault/import-worker.ts`](../../src/lib/vault/import-worker.ts) | Streaming vault import, progress, and cancellation |
| [`src/lib/vault/export-worker.js`](../../src/lib/vault/export-worker.js) | Streaming vault export, progress, and cancellation |
| [`src/lib/qdrant.ts`](../../src/lib/qdrant.ts) | Vector collection and point operations |

When changing job states, provider behaviour, retry safety, or concurrency defaults, update code, environment templates, the operations runbook, and this overview together.
