# Import Pipeline

> **Status:** Active engineering overview
>
> **Last reviewed:** 2026-10-16, after the domain audit fixes landed on `dev` (#632 to #634)
>
> **Source of truth:** [`src/lib/queue.ts`](../../src/lib/queue.ts), [`src/lib/canvas/worker-entry.ts`](../../src/lib/canvas/worker-entry.ts), and the import workers

This page explains the shared background-processing shape for Canvas, direct
upload/extraction, and vault jobs. Deployment actions, exact environment queue
names, tuning values, and live troubleshooting belong in the
[`import-worker` operations runbook](../operations/import-worker.md).

## End-to-end flow

1. An API validates the user, creates relational job/import rows, and submits a typed message through the queue facade.
2. The worker discovers Canvas courses, modules, and files. Committed file rows enter the fair scheduler immediately, so earlier files can download while discovery continues.
3. Files are downloaded and deduplicated, note/tree rows are created, and binary objects are stored through the S3-compatible provider. A durable `pending_extract` row records the exact object key and queues the next stage. Canvas files with the same name retain separate note identities.
4. The extraction stage reloads stored bytes and uses supported text parsers or optional Marker OCR. Extraction coverage records whether the result is partial.
5. Text is normalized, chunked, and embedded. Chunk text stays in PostgreSQL; vectors are upserted to Qdrant.
6. Job and per-file status rows drive UI progress. Extraction failures re-enter the shared import lane after a delayed retry backoff (30, 120, 480 and 900 s).

A direct upload (`POST /api/upload`) writes the object first, then the note,
attachment and `app.ingestion_jobs` row in one transaction, then enqueues an
`extract` job. If that enqueue fails, the job row is marked `failed` so
`/api/ingestion-status` stops reporting `pending`. The old `POST /api/extract`
route was a second, divergent extraction path with no caller; it was deleted.

Files can appear before semantic indexing completes. Product copy must distinguish visible material from search/chat-ready material.

## Canvas execution ownership

Canvas discovery and file execution carry database ownership tokens. Publication
checks them inside the user-tree transaction, including nested note/cache
writes. Durable retry sequences reject stale deliveries. Recovery observes by
default until compatible workers are deployed everywhere. The new staged
extraction path separately reclaims its own expired leases after fencing the
previous worker; migration 070 stores the key required to resume safely. Each
reclaim spends one retry, and the file settles as a retryable `error` after
four, so a PDF that crashes the parser can no longer restart the worker
forever.

Identical active requests reuse their run. Replacement and Stop name the active
job the user actually observed. Retryable failures move to a new run; completed
notes stay available. See the [reliability handover](canvas-import-queue-reliability-handover.md)
for behavior and release gates, and the [worker runbook](../operations/import-worker.md#canvas-claim-recovery-rollout)
for recovery rollout.

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

Concurrent first-time requests for the same hash elect one durable producer.
Other imports wait in `pending_cache`, including while that producer waits for
Marker or a scheduled retry. The ownership lock covers only that decision;
OCR runs after it is released. Both users may still need to download the bytes
before their common hash is known. Ready canonical results cannot be recaptured
from subsequent user edits.

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

The current Canvas sync path discovers newly seen Canvas file IDs. It does not
yet reimport a completed file whose Canvas ID is unchanged but whose revision
metadata later changes; that needs an explicit revision/replacement policy
before it can be described as a full content-sync guarantee.

`IMPORT_PIPELINE_VERSION` invalidates derived artifacts when extraction,
chunking, Marker policy, or embedding compatibility changes. Operators should
set it explicitly during such a rollout; otherwise it defaults to the selected
embedding model plus the current cache format version.

## Queue providers

[`src/lib/queue.ts`](../../src/lib/queue.ts) owns the provider switch:

- **BullMQ** is the default and current homelab provider. New import work,
  including delayed extraction retries, uses the environment-prefixed
  `canvas-import` queue. Long serverless OCR waits use the separate
  `marker-dispatch` queue. The `extract-retry` consumer only drains messages
  created before the fairness rollout. Every BullMQ publish has a
  `QUEUE_PUBLISH_TIMEOUT_MS` limit (10 s by default), so a Redis outage fails
  the caller instead of hanging it.
- **Cloudflare Queues** is implemented as an alternate HTTP publish/pull provider selected by `QUEUE_PROVIDER=cloudflare`. It is the target migration path, not the assumed live value.
- The same Node worker dispatches both queue providers and retains PostgreSQL
  recovery for Canvas discovery plus Marker jobs whose dispatch or completion
  enqueue was lost. It cannot reconstruct arbitrary direct-extraction, retry,
  or vault payloads.

Default BullMQ jobs use three attempts with exponential backoff. Vault import
and export enqueue sites override this to one attempt; in particular, a
partial vault-import retry is not yet idempotent and can create duplicate
notes.

Canvas discovery does not fan every file directly into the provider queue.
Pending files pass through a provider-neutral scheduler using smooth weighted
round robin across `free`, `semester`, and `academic_year` service classes with
weights 1:3:5. Within a class, the least-recently served eligible user goes
next, and each user has at most two dispatched downloads at a time. New
downloads pause when eight of that user's files await or run extraction. This preserves a
paid queue advantage without allowing one large import or one class to starve
the rest. `app.login.import_service_class` is local entitlement state and
defaults to `free`.

## Concurrency and timing

Code fallbacks, committed template values, and private live values are
different concepts. The operations runbook owns the verified comparison and
tuning procedure; do not copy that table into engineering overviews.

Since 2026-10-04 the logger keeps only a severity, a fixed category and a
status class, so per-message timings don't reach the logs. Canvas and chat
jobs have named Sentry processing spans with child HTTP and database spans
once a DSN is configured; see [monitoring](../operations/monitoring.md), which
also records whether it is on. Without it, compare per-stage timestamps in
`app.canvas_imports` and `app.canvas_import_jobs` before changing a
concurrency limit. Restoring a short allowlist of log fields is an open item
in the [domain audit record](../history/2026-10-06-domain-audit.md).
The scheduler caps downloads and the extraction backlog separately. Those caps
keep stored, unprocessed files bounded while allowing both stages to overlap.

Throughput depends on document shape, OCR availability, provider limits, CPU,
storage latency, queue pressure, and GPU capacity. Retry timing and concurrency
changes are operational changes even when they require only an environment
variable.

## Reliability boundaries

- Canvas discovery, per-file execution, and the legacy in-flight message path
  use database claims scoped to an active Canvas job, so stale or duplicate
  deliveries cannot take over a newer generation. Queue publication leases are
  reclaimed when a process dies between its database commit and queue publish.
- Canvas extraction retries persist `pending_retry` before publishing, carry
  the exact import-row/job generation, and compare-and-swap that row to an
  active indexing claim. The worker re-enqueues stale durable retry rows after
  a publication crash; a redelivery after completion is a no-op.
- Canvas resource discovery follows pagination links, uses Canvas string IDs,
  starts serially by default to avoid throttle penalties, includes the flat
  course Files inventory, and rejects a partial/failed API listing rather than
  treating it as an empty course. Downloaded files are bounded by
  `CANVAS_MAX_FILE_BYTES` before buffering.
- The worker heartbeats actively owned Canvas files and treats
  `CANVAS_FILE_TIMEOUT_MS` as a supervision warning rather than racing a
  non-abortable parser/indexer against a false timeout. It periodically
  re-enqueues orphaned Canvas discovery jobs.
- Vault jobs persist progress and support cooperative cancellation between files. A
  vault import that encounters a per-file failure retains files created before
  the failure but ends in `failed` rather than claiming a complete archive;
  retrying it is still non-idempotent until replay identity is implemented.
  Folders merge by title into the existing tree. A cancel on a queued vault job
  takes effect immediately. Jobs whose worker died are expired by the status,
  import-start and export routes: `processing` with no heartbeat for 30
  minutes, or `queued` for 2 hours.
- The vault ZIP reader (`zip-stream.ts`) caps an archive at 50,000 entries,
  250 MB per entry, 20 GB inflated and 512 MB staged on disk; `tree-builder.ts`
  caps folder depth at 32 levels.
- Marker page ranges produce explicit extraction-coverage metadata, but there is no automatic full-document enrichment pass after a successful partial preview.
- `MARKER_OCR_ENABLED` accepts `1`, `true`, `on` or `yes`; anything else, including `false`, bypasses Marker even when `MARKER_API_URL` is configured. `pdf-parse` remains a text-layer fallback, not OCR, so scanned PDFs will not become searchable while OCR is disabled.
- Serverless Marker creates `app.marker_jobs` before provider work, uses a
  stable result key, signs object URLs only at dispatch, and makes at most one
  application-originated GPU call for that durable row. An ambiguous outcome
  enters `awaiting_result` and observes the immutable result object rather
  than automatically redispatching. Completion queue messages carry only the
  durable job UUID; the worker validates the bound v1 result object and marks
  the Canvas import complete only after note/chunk/vector writes succeed.
  `MARKER_SERVERLESS_DISPATCH_ENABLED=false` pauses existing dispatch without
  deleting its state. Observation of an ambiguous job ends when
  `MARKER_RESULT_GRACE_SECONDS` runs out or five minutes after the signed result
  URL expires, whichever comes first; a RunPod job still pending then is
  cancelled at RunPod before the row fails. Its RunPod `ttl` is capped at
  `MARKER_SERVERLESS_URL_TTL_SECONDS`.
- Replacing or cancelling a Canvas job cancels its queued file, retry, and
  Marker state transactionally. A GPU conversion already in flight cannot be
  unsent and may still write its signed result object. Cancellation wins before
  a completion claim begins; a completion already holding its claim may finish
  its indexing work, but no cancelled state is later resurrected.
- Qdrant updates go through [`src/lib/rag/indexing.ts`](../../src/lib/rag/indexing.ts), keeping vector-provider details out of the import stages.
  The indexer locks the active note through the vector upsert. Permanent note
  deletion takes the same lock, so it either fences the indexer before it writes
  chunks or removes the exact new point IDs afterwards; a deleted note cannot
  be resurrected in search by an in-flight import.

## Important implementation files

| File | Responsibility |
|---|---|
| [`src/lib/queue.ts`](../../src/lib/queue.ts) | Queue-provider facade, naming, publish/pull/ack, and BullMQ defaults |
| [`src/lib/canvas/worker-entry.ts`](../../src/lib/canvas/worker-entry.ts) | Worker lifecycle, periodic tasks, recovery polls and shutdown |
| [`src/lib/worker/`](../../src/lib/worker/) | Worker helpers: `consumers.ts` (BullMQ workers and Cloudflare pull loops), `periodic.ts` (non-overlapping periodic tasks), `heartbeat.ts`, `maintenance.ts` (study-job drain and batched pruning) |
| [`src/lib/canvas/job-dispatch.ts`](../../src/lib/canvas/job-dispatch.ts) | Queue message validation and routing to handlers |
| [`src/lib/canvas/import-runs.ts`](../../src/lib/canvas/import-runs.ts) | Start, replace and retry runs under the per-user lock |
| [`src/lib/canvas/import-worker.ts`](../../src/lib/canvas/import-worker.ts) | Legacy single-pass `canvas-import` handler and the handler exports the worker uses |
| [`src/lib/canvas/import-discovery.ts`](../../src/lib/canvas/import-discovery.ts) | Canvas hierarchy discovery and per-file fan-out |
| [`src/lib/canvas/import-scheduler.ts`](../../src/lib/canvas/import-scheduler.ts) | Weighted fair dispatch |
| [`src/lib/canvas/import-extraction.ts`](../../src/lib/canvas/import-extraction.ts) | `canvas-file` and `canvas-extract` stages, extract recovery, direct `/api/upload` extraction, retries, Marker completion and job completion |
| [`src/lib/canvas/import-cache.ts`](../../src/lib/canvas/import-cache.ts) | Content hashing, shared artifacts, cached vector reuse, and ownership guards |
| [`src/lib/canvas/import-embedding.ts`](../../src/lib/canvas/import-embedding.ts) | Extraction, chunking, embedding, and Qdrant indexing handoff |
| [`src/lib/marker/serverless.ts`](../../src/lib/marker/serverless.ts) | Durable Marker submission, provider dispatch, result handoff, and recovery |
| [`src/lib/marker/vast.ts`](../../src/lib/marker/vast.ts) | Bounded Vast REST routing/polling client |
| [`src/lib/canvas/extraction-retry.ts`](../../src/lib/canvas/extraction-retry.ts) | Delayed retry schedule |
| [`src/lib/vault/import-worker.ts`](../../src/lib/vault/import-worker.ts) | Streaming vault import, progress, and cancellation |
| [`src/lib/vault/export-worker.ts`](../../src/lib/vault/export-worker.ts) | Streaming vault export, progress, and cancellation |
| [`src/lib/vault/zip-stream.ts`](../../src/lib/vault/zip-stream.ts) | Untrusted ZIP reader and its limits |
| [`src/lib/vault/jobs.ts`](../../src/lib/vault/jobs.ts) | Vault job lifecycle: heartbeat, stale expiry, cancel |
| [`src/lib/qdrant.ts`](../../src/lib/qdrant.ts) | Vector collection and point operations |

When changing job states, provider behaviour, retry safety, or concurrency defaults, update code, environment templates, the operations runbook, and this overview together.
