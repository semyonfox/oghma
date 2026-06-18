# Canvas And Vault Import Optimization Summary

This is the condensed record of the import pipeline optimization. Current deployment steps live in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md). Canvas import cost and page-volume planning live in [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md).

## Problem

Canvas and vault imports could take many minutes before files became usable. The original causes were:

- Nested concurrency across downloads, OCR, embeddings, and database writes
- No clear split between "file is visible" and "file is RAG-ready"
- Repeated OCR readiness/cold-start checks in the old AWS Marker path
- GPU/OCR throughput being much lower than file ingestion throughput

## Current Design

| Track | Result |
|---|---|
| Backpressure | Per-stage concurrency caps prevent downloads, OCR, and embedding writes from overwhelming each other |
| Two-phase status | Files can appear in the workspace while indexing continues in the background |
| Retry path | Extraction failures can be retried through the `extract-retry` BullMQ queue |
| Worker safety-net | The worker periodically reclaims queued/discovering jobs that were not enqueued cleanly |
| Progress and cancellation | Vault jobs persist `processed_files` and support cooperative cancellation |

Status language:

- `queued` / `discovering`: job accepted and worker discovery in progress
- `processing`: worker is actively handling files
- `indexing`: file is visible, extraction/embedding is still running
- `indexed` / `complete`: content is ready for search/chat
- `failed` / `cancelled`: terminal states requiring user or operator action

## Important Files

| File | Responsibility |
|---|---|
| `src/lib/queue.ts` | BullMQ queues and enqueue helpers |
| `src/lib/canvas/worker-entry.js` | Worker entry point, BullMQ consumers, orphan requeue safety-net |
| `src/lib/canvas/import-discovery.js` | Course/module/file discovery and fan-out |
| `src/lib/canvas/import-extraction.js` | File download, dedupe, note creation, per-file timeout |
| `src/lib/canvas/import-embedding.js` | Extraction, chunking, embedding, Marker retry |
| `src/lib/canvas/extraction-retry.ts` | Delayed extraction retry handling |
| `src/lib/rag/indexing.ts` | Embedding replacement utility |
| `src/lib/vault/import-worker.js` | Vault import streaming and progress |
| `src/lib/vault/export-worker.js` | Vault export streaming and progress |
| `src/app/api/canvas/status/route.js` | Canvas import status response |
| `src/app/api/vault/status/route.ts` | Vault import/export status response |

## Tunable Values

| Variable | Purpose |
|---|---|
| `CANVAS_GLOBAL_FILE_CONCURRENCY` | Limits total file processing |
| `CANVAS_OCR_CONCURRENCY` | Limits extraction/OCR work |
| `CANVAS_EMBED_CONCURRENCY` | Limits embedding writes |
| `CANVAS_FILE_TIMEOUT_MS` | Caps per-file processing time |
| `CANVAS_POLL_INTERVAL_MS` | Controls status polling cadence |
| `MARKER_API_URL` | Enables Marker OCR when available |

## Expected User Impact

- Files should become visible before full AI indexing finishes.
- Users should see progress rather than waiting on a silent full-course import.
- OCR-heavy PDFs remain the bottleneck; the UI should say when processing may take minutes.
- Provider rate limits and OCR availability still determine real throughput.

## Historical Notes

Earlier versions of this doc described ECS, SQS, CloudWatch metrics, and AWS Marker autoscaling. Those details are no longer the live deployment path. If an AWS worker/GPU stack is reintroduced, recreate the runbook from the current code and current cloud pricing instead of copying the old commands back verbatim.

Current planning favours on-demand rented GPU batches over Datalab/managed document APIs for steady-state Canvas imports.
