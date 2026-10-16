# Domains

> **Status:** Current reference
>
> **Last reviewed:** 2026-10-16, built from the [domain audit](../history/2026-10-06-domain-audit.md) reports and checked against `dev` after the audit fixes landed (#632 to #635)
>
> **Source of truth for:** Which code, routes, workers and data belong to each product area. Behaviour contracts live in the linked deeper docs.

OghmaNotes splits into the 18 areas below. Each section lists where requests come in, the main flow, the data it reads and writes, what it calls outside the process, and where its code lives. Use it to scope a change or a future per-domain audit; follow the links for the detailed contracts.

The cross-cutting shape (app, worker, queues, storage systems) is in [Architecture](architecture.md). Paths are relative to the repository root. Tables live in the `app` schema. Redis keys and queue names get an environment prefix, and S3 keys sit under `STORAGE_PREFIX`.

| # | Domain | Main code |
|---|---|---|
| 1 | [Auth and accounts](#1-auth-and-accounts) | `src/lib/auth/`, `src/app/api/auth/` |
| 2 | [Notes and tree](#2-notes-and-tree) | `src/lib/notes/`, `src/components/notes/` |
| 3 | [Editor and Markdown](#3-editor-and-markdown) | `src/components/editor/`, `src/lib/markdown/` |
| 4 | [Storage and upload](#4-storage-and-upload) | `src/lib/storage/`, `src/app/api/upload/` |
| 5 | [Extraction and Marker](#5-extraction-and-marker) | `src/lib/marker/`, `src/lib/ingestion/`, `infra/*marker*` |
| 6 | [RAG and search](#6-rag-and-search) | `src/lib/rag/`, `src/lib/qdrant.ts` |
| 7 | [Chat](#7-chat) | `src/lib/chat/`, `src/app/api/chat/` |
| 8 | [Quiz](#8-quiz) | `src/lib/quiz/`, `src/app/api/quiz/` |
| 9 | [Study maps](#9-study-maps) | `src/lib/study-map/` |
| 10 | [Canvas sync and assignments](#10-canvas-sync-and-assignments) | `src/lib/canvas/` (client, `sync-*.ts`, `raw-export*.ts`) |
| 11 | [Canvas import and worker](#11-canvas-import-and-worker) | `src/lib/canvas/import-*.ts`, `src/lib/canvas/worker-entry.ts`, `src/lib/worker/` |
| 12 | [Canvas MCP](#12-canvas-mcp) | `src/lib/canvas/mcp.ts`, `src/lib/canvas-mcp/` |
| 13 | [Vault](#13-vault) | `src/lib/vault/`, `src/app/api/vault/` |
| 14 | [Calendar and planning](#14-calendar-and-planning) | `src/lib/calendar/`, `src/components/calendar/` |
| 15 | [Public site, telemetry and i18n](#15-public-site-telemetry-and-i18n) | `src/app/` public pages, `src/lib/i18n/`, `src/lib/public/` |
| 16 | [Platform shell](#16-platform-shell) | top-level `src/lib/*.ts`, `src/app/layout.tsx` |
| 17 | [Database, CI and infra](#17-database-ci-and-infra) | `src/database/`, `database/migrations/`, `scripts/` |
| 18 | [Android app](#18-android-app) | `apps/mobile/` |

## 1. Auth and accounts

Sign-up, sign-in, sessions, password reset, account settings and deletion.

- **Entry points:** pages `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/change-password`, `/auth/error`, `/auth/mobile`, `/auth/mobile/callback`, `/settings`. Routes under `src/app/api/auth/` (`[...nextauth]`, `login`, `register`, `verify-email`, `resend-verification`, `password-reset/*`, `change-password`, `me`, `logout`, `delete-account`, `avatar` and `avatar/image`, `mobile/authorize`, `mobile/exchange`), plus `/api/settings` and `/api/onboarding/welcome`. `src/proxy.ts` gates app pages and some API prefixes on cookie presence.
- **Flow:** both password paths share `lib/auth/password-login.ts`: atomic Redis lockout (5 tries per 15 min, then 30 min), bcrypt even for unknown emails, and only then the deactivated or unverified answer. Login, reset and resend also have per-IP limits, and reset and resend send their mail after the response behind a shared response-time floor. OAuth goes through `auth.config.ts` and `lib/auth/oauth.ts`, which link or claim accounts under advisory locks. `validateSession` checks `session_version`, `is_active`, `deleted_at` and `email_verified` on every API call. Revocation bumps `session_version`; logout only clears cookies. Delete account is a soft delete that clears every session cookie, revokes the calendar, reset, verification and Canvas tokens, and cancels queued Canvas and study-map jobs. The worker's daily purge removes the account 30 days later.
- **Data:** `app.login`, `app.oauth_accounts`, `app.agent_registration_claims`, `app.rate_limit_log`. Redis `ratelimit:{attempts,window,lockout}:<email>`, `mobile-auth-v2:{…}:grant:<sha256>`, `rl:{id}:<category>`. S3 `settings/<user>/settings.json` and `avatars/<user>/…`.
- **External:** Google and GitHub OAuth, Cloudflare Email or Resend.
- **Code:** `src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`, `src/lib/auth/` (including `account-purge.ts` and `cancel-user-jobs.ts`), `src/lib/crypto.ts`, `src/lib/email.ts`.
- **Docs:** [Architecture: API routes and sessions](architecture.md#api-routes), [security rollout](../operations/security-rollout.md), [email](../operations/email.md).

## 2. Notes and tree

The notes workspace: create, open, save, move, trash and restore.

- **Entry points:** pages `/notes`, `/notes/[id]`, `/notes/trash`. Routes `/api/notes` (list, create), `/api/notes/[id]` (read, update, trash), its `assets`, `backlinks` and `offline` subroutes, `/api/tree`, `/api/tree/children`, `/api/tree/status`, `/api/trash`. Worker passes `purgeExpiredTrash`, `processPendingNoteDeletionCleanup` and `reconcileTrashedVectorVisibility`, and the `note-reindex` job.
- **Flow:** a save runs in one transaction (`SELECT … FOR UPDATE`, the `expectedUpdatedAt` 409 check, then `COALESCE` per field so only sent fields change) and queues a delayed, deduplicated `note-reindex` job that re-embeds in the worker. Create and move take the per-user advisory lock `hashtextextended(user_id, 0)`. Trash stamps a cohort, cancels related jobs and hides vectors; restore falls back to the root when the original folder isn't live; permanent delete removes rows and queues S3 and Qdrant cleanup in `app.note_deletion_cleanup_tasks`. Other tabs hear about changes through BroadcastChannel.
- **Data:** `app.notes`, `app.tree_items`, `app.note_links`, `app.attachments`, `app.note_deletion_cleanup_tasks`, plus cascading writes to job, chunk, chat, quiz and annotation tables on delete. No Redis read path: the single-note cache was removed, and `tree-cache.ts` only deletes old tree and list keys after imports publish. Browser IndexedDB `oghma-notes` and `oghma-ui`, localStorage layout and invalidation keys.
- **External:** S3; the embedding provider and Qdrant through the reindex job and trash visibility updates.
- **Code:** `src/lib/notes/` (`api/`, `cache/`, `hooks/`, `state/`, `storage/`, `types/`, `utils/`, `note-limits.ts`, `tree-cache.ts`), `src/components/notes/`, `src/app/api/{notes,tree,trash}/`, `src/lib/rag/note-reindex.ts`. See [`src/lib/notes/README.md`](../../src/lib/notes/README.md).
- **Docs:** [file-tree coordination](file-tree-coordination.md), [Architecture: note lifecycle](architecture.md#note-lifecycle).

## 3. Editor and Markdown

The Milkdown editor, split panes, the shared Markdown renderer, PDF, image and video viewers.

- **Entry points:** `SplitEditorPane` inside the notes workspace, `/syntax-guide`, `/api/pdf/annotations` (no client calls it yet). `MarkdownRenderer` is also used by chat, quiz and study maps.
- **Flow:** `MarkdownEditor` shows a draft or cached copy first, fetches the note, and saves through `PUT /api/notes/:id` on Ctrl/Cmd+S, blur or the header button. Drafts are written to IndexedDB after 1 s and flushed on `beforeunload`, `pagehide` and `visibilitychange`. A failed fetch only closes the pane on 400, 403 or 404. PDFs stream from `/api/upload?stream=1` and are cached in IndexedDB.
- **Data:** `app.pdf_annotations`. IndexedDB `oghma-ui` (drafts), `oghma-notes` (read only here), `oghmanotes-pdf-cache-v2` (50 entries or 500 MB, 100 MB per file).
- **External:** none at runtime beyond the app's own APIs. Libraries: Milkdown Crepe, react-pdf/pdf.js, Shiki, Mermaid, DOMPurify, KaTeX.
- **Code:** `src/components/editor/`, `src/lib/markdown/`, `src/lib/notes/pdf-cache/`, `src/lib/notes/draft-cache.ts`, `src/lib/notes/storage/pdf-annotations.ts`.
- **Docs:** [Markdown editing and rendering](markdown-rendering.md), [split-pane editor](split-pane-editor.md).

## 4. Storage and upload

The object-storage contract and the direct file upload path.

- **Entry points:** `POST /api/upload` (upload, optionally into an existing note), `GET /api/upload?path=` and `?stream=1` (same-origin, cookie-authenticated stream; browsers never get storage URLs). `getStorageProvider()`, `readBoundedBody()` and `detectMimeType()` are used across the app.
- **Flow:** rate limit, bounded body read, MIME sniffing against an allowlist, then write the object first, then note, attachment and `app.ingestion_jobs` in one transaction, then enqueue `extract`. Failures delete the object, so a crash can only orphan an unreferenced object. Streams serve allowlisted types inline and everything else as a sandboxed download.
- **Data:** `app.attachments`, `app.ingestion_jobs`, `app.notes`/`app.tree_items` for new notes. S3 `notes/<noteId>/<attachmentId>/<file>`. The same bucket holds the other domains' prefixes: `settings/`, `avatars/`, `marker/`, `marker-results/`, `imports/`, `canvas/`, `vault/`, `vault-uploads/`, `exports/`.
- **External:** Cloudflare R2 in production, RustFS or any S3-compatible store elsewhere, via `STORAGE_*`. Clients connect in 5 s and must see response headers within 60 s.
- **Code:** `src/lib/storage/` (`base.ts` contract and `ObjectNotFoundError`, `s3.ts`, `init.ts`, `file-names.ts`, `inline-content.ts`), `src/lib/http/bounded-body.ts`, `src/lib/ingestion/detect-mime.ts`, `src/app/api/upload/route.ts`.
- **Docs:** [import pipeline](import-pipeline.md) for what happens after upload. `getObjectMeta`, `getObject` and `hasObject` report a confirmed 404 as absence and reject on every other failure, so an outage is never treated as a missing object.

## 5. Extraction and Marker

Turning uploaded and imported files into text, including OCR through Marker.

- **Entry points:** `GET /api/ingestion-status` (polled by the PDF viewer), `POST /api/internal/marker/[token]/[callbackId]` (RunPod webhook). Worker: `dispatchMarkerJob` on the `marker-dispatch` queue and Marker recovery on the worker's polls. Library: `submitMarkerJob`, `extractContentFromBuffer` (text file, then pdf.js text layer, then direct Marker if enabled), `extractWithMarker`. The old `POST /api/extract` route is gone.
- **Flow:** a scanned PDF creates one durable `app.marker_jobs` row. Dispatch makes at most one paid provider call per row. Definitive rejections fail at once; ambiguous outcomes wait in `awaiting_result` and probe the immutable result object until `MARKER_RESULT_GRACE_SECONDS` runs out or the signed upload URL has expired, after which a RunPod job is cancelled. A terminal webhook only moves a row still waiting on RunPod. Completion is handled by the Canvas consumers (domain 11).
- **Data:** `app.marker_jobs`, `app.ingestion_jobs`, `app.canvas_imports.pending_marker`, `app.notes` extracted text. S3 `marker-results/<callbackId>.json` (write-once), `marker/<user>/<note>/…`.
- **External:** RunPod or Vast serverless, the direct Marker server (`MARKER_API_URL`). All gated by `MARKER_OCR_ENABLED` and `MARKER_SERVERLESS_DISPATCH_ENABLED`, both off in the templates.
- **Code:** `src/lib/marker/` (`config.ts`, `serverless.ts`, `runpod.ts`, `vast.ts`, `ocr.ts`, `output.ts`, `result.ts`, `errors.ts`, `worker-config.ts`), `src/lib/ingestion/extraction-core.ts`, `infra/runpod-marker/`, `infra/vast-marker/`, `infra/marker/`.
- **Docs:** [RunPod Marker](../operations/runpod-marker.md), [Vast Marker](../operations/vast-marker.md), [hosted vision](../operations/marker-hosted-vision.md), [import pipeline](import-pipeline.md).

## 6. RAG and search

Chunking, embeddings, the vector index and search.

- **Entry points:** global search modal (Cmd/Ctrl+K, nav buttons) on `/notes`, `/chat`, `/calendar`, `/quiz`, `/settings` and `/study-map`, backed by `GET /api/global-search`. `GET /api/search` (keyword or semantic) is a public agent API with no in-app caller. Index writer `replaceNoteEmbeddings`. Scripts `reindex-all-notes.ts` and `backfill-embeddings-direct.ts`.
- **Flow:** indexing chunks text (500 characters, sentence-aligned), embeds in batches, and inserts chunk rows under app-minted UUIDv7 ids while holding the note lock, then upserts the same ids to Qdrant. Queries embed once (one 10 s attempt per endpoint), search Qdrant filtered by `user_id`, then re-read chunk text in SQL scoped to the user's live notes. No reranking: the unused rerank modules were deleted, although `RERANK_*` settings are still in the env templates. Global search starts the query embedding first, runs keyword queries meanwhile, and drops the semantic section if embedding fails. Semantic search has its own rate limit.
- **Data:** `app.chunks`, `app.notes.extracted_text`, `app.note_deletion_cleanup_tasks.chunk_ids`. Qdrant collection `QDRANT_COLLECTION` (payload `chunk_id`, `document_id`, `user_id`, `searchable`). Redis rate-limit keys.
- **External:** an OpenAI-compatible `/embeddings` endpoint (primary plus fallback), Qdrant.
- **Code:** `src/lib/rag/`, `src/lib/qdrant.ts`, `src/lib/global-search/`, `src/components/search/`, `src/app/api/{search,global-search}/`.
- **Docs:** [vector index rebuild](../operations/vector-index.md), [database performance](database-performance.md).

## 7. Chat

AI chat over the user's notes, with durable background generation and approval-gated actions.

- **Entry points:** `/chat`, `/chat/[sessionId]`, `/chat/actions/[id]`. Routes `POST /api/chat`, `/api/chat/generations/[id]/stream` and `/cancel`, `/api/chat/sessions` and `/sessions/[id]` (plus message ratings), `/api/chat/presence` and `/presence/disconnect`, `/api/chat/actions/[id]`. Worker consumer for the `chat-generation` queue, plus recovery and daily pruning.
- **Flow:** the browser posts with background delivery and gets 202. The worker claims a lease, streams the model through a paragraph buffer into a Redis Stream, and finalises in PostgreSQL. The browser replays from the last event ID; a rerun of a started generation sends a `reset` event first, and the stream falls back to polling PostgreSQL if Redis fails. Cancel and session delete settle in PostgreSQL without Redis. Every tool that writes (notes, time blocks, Canvas) only stores a proposal in `app.chat_tool_actions`; it runs when the user approves it. Inline SSE and JSON modes exist for API clients.
- **Data:** `app.chat_sessions`, `app.chat_messages`, `app.chat_generations`, `app.chat_tool_actions`; reads notes, chunks, time blocks and assignments. Redis `chat-generation:{id}:events` (1 h), `chat-generation:{id}:cancel`, `chat:presence:{user}`, the BullMQ queue.
- **External:** OpenRouter-compatible LLM (`src/lib/ai-config.ts`), embeddings, the internal Canvas MCP endpoint.
- **Code:** `src/lib/chat/` (one flat folder: `generation-store.ts`, `generate-background.ts`, `prepare-generation.ts`, `build-stream.ts`, `session.ts`, `presence.ts`, `actions.ts`, `canvas-mcp-client.ts` and friends, plus `hooks/`), `src/components/chat/`, `src/app/chat/`, `src/app/api/chat/`. See [`src/lib/chat/README.md`](../../src/lib/chat/README.md).
- **Docs:** [chat runbook](../operations/chat.md), [Architecture: search and chat](architecture.md#search-and-chat).

## 8. Quiz

Flashcards generated from note chunks and scheduled with FSRS.

- **Entry points:** `/quiz`, `/quiz/session/[id]`. Routes `POST /api/quiz/sessions`, `GET|DELETE /api/quiz/sessions/[id]`, `POST /api/quiz/sessions/[id]/answer`, `/api/quiz/cards/[id]`, `/api/quiz/questions/[id]/related`, `/api/quiz/dashboard` (and `/courses`), `GET /api/quiz/streak`, `/api/quiz/review-dates`. Worker hook `seedQuestionsAfterImport` after Canvas and vault imports.
- **Flow:** a session resolves the filter to live chunks, buckets cards into due, new and retention, and fills the session 70/20/10 with backfill. Chunks with no card get questions generated in the background (LLM output validated with zod, persisted in one transaction). Answers are graded on the server with the same `gradeAnswer` the client uses, a repeated answer replays the stored result, and FSRS state includes `learning_steps` (migration 080). Streaks use the student's IANA time zone.
- **Data:** `app.quiz_questions`, `app.quiz_cards`, `app.quiz_reviews`, `app.quiz_sessions`, `app.user_streaks`; reads chunks, notes and course settings. Qdrant for the search filter and related notes. No Redis or S3.
- **External:** LLM, embedding provider (search filter only), `ts-fsrs`.
- **Code:** `src/lib/quiz/`, `src/app/api/quiz/`, `src/app/quiz/`, `src/components/quiz/`, `src/lib/notes/state/quiz.ts`.
- **Docs:** none beyond this page. Questions keep the old `chunk_id` when a note is re-indexed, so editing a note retires its cards; that is an open item in the [audit record](../history/2026-10-06-domain-audit.md).

## 9. Study maps

Course maps that organise notes around reviewed topics, plus exam-paper analysis.

- **Entry points:** `/study-map`. Routes `/api/study-maps`, `/api/study-maps/setup`, `/api/study-maps/search`, and under `/api/study-maps/[id]`: the map itself, `board`, `jobs`, `materials`, `papers` (and `papers/import`), `refresh`, `topics`. The note inspector calls `GET /api/study-maps?noteId=`. The worker drains study jobs every 5 s within a time budget and reconciles auto maps every 60 s.
- **Flow:** opening the page creates a map per imported Canvas course, then auto-configures as many as fit in about 20 seconds: sync materials, write a course outline note, queue one topic proposal, then classify new or changed materials. Jobs live in PostgreSQL with `SKIP LOCKED` claims and a 5 minute lease; provider calls run outside transactions and results are rechecked before publishing. Job messages, failure mapping and result validation are in `job-policy.ts`.
- **Data:** `app.study_maps`, `app.study_materials`, `app.study_papers`, `app.study_jobs`, `app.study_map_dismissed_courses`, `app.study_decision_cache`, `app.study_generation_cache`, `app.module_descriptors`; reads notes, assignments and Canvas import state; writes outline notes.
- **External:** Jev Decisions API on OpenRouter, the generative LLM, University of Galway module pages, the Canvas API.
- **Code:** `src/lib/study-map/`, `src/components/study-map/`, `src/app/api/study-maps/`.
- **Docs:** [Study maps](study-map.md), [exam papers](exam-papers.md).

## 10. Canvas sync and assignments

Connecting Canvas, the assignment tracker, course settings and the raw Canvas export.

- **Entry points:** Settings Canvas section; the assignment tracker in `src/components/assignments/`. Routes `/api/canvas/connect`, `/api/canvas/courses`, `/api/canvas/download`, `/api/canvas/sync`, `/api/assignments` and `/api/assignments/[id]` (plus `canvas`, `materials`), `/api/assignments/sync`, `/api/courses/settings`, `/api/planner/items`.
- **Flow:** connecting validates the token against Canvas and stores it encrypted per user. Every Canvas request goes through `safe-fetch.ts` (HTTPS, public IPv4 only, pinned DNS, manual redirects, 30 s headers, 60 s idle body, and an overall deadline of 2 min for API calls and 10 min for downloads) with retries on transient errors. Assignment sync upserts by Canvas id, keeps a user's done or in-progress status unless Canvas reports the work submitted, and deletes rows Canvas no longer lists after a complete read. The raw export streams a ZIP as it discovers content. Exports are limited to 3 an hour and assignment syncs to 20.
- **Data:** `app.login.canvas_token` and `canvas_domain`, `app.assignments`, `app.user_course_settings`, `app.canvas_planner_items` (`sync-planner-items.ts` exists but nothing calls it, so the table stays empty). Reads `app.canvas_imports` and `app.canvas_import_jobs`.
- **External:** the Canvas REST API with the user's token; the browser calls the Canvas account directory directly.
- **Code:** `src/lib/canvas/` (`client.ts`, `safe-fetch.ts`, `credentials.ts`, `sync-assignments.ts`, `sync-courses.ts`, `sync-planner-items.ts`, `raw-export*.ts`, `load-assignment.ts`, `assignment-materials.ts`), `src/components/settings/canvas-*`, `src/lib/notes/state/{assignments,courses}.ts`. See [`src/lib/canvas/README.md`](../../src/lib/canvas/README.md).
- **Docs:** [Canvas data emergency plan](canvas-data-emergency-plan.md) for what Canvas data is kept.

## 11. Canvas import and worker

The Canvas import pipeline and the shared worker process.

- **Entry points:** `POST|DELETE /api/canvas/import`, `/api/canvas/retry`, `/api/canvas/status`, `/api/canvas/logs`. UI: `canvas-import-notifications.tsx` (the single owner of status polling) and `canvas-import-indicator.tsx`. Worker: `npm run worker` starts `src/lib/canvas/worker-entry.ts` (also the `Dockerfile.worker` command), which routes messages through `src/lib/canvas/job-dispatch.ts` and uses the helpers in `src/lib/worker/`. Scripts `worker-healthcheck.ts`, `process-pending-retry-local.ts`, the cache revision scripts.
- **Flow:** start a run under the per-user lock, discover courses, modules and files, hand files to the weighted fair scheduler (1:3:5 by service class, two downloads per user), download and dedupe PDFs by SHA-256, publish notes under the tree lock, extract and embed, or hand off to Marker. Recovery polls run every 30 s and 5 min; retention passes run daily; periodic tasks never overlap themselves. Workers own work through DB claim tokens with 5 minute leases, and reclaiming a crashed extraction spends one of its four retries. The worker writes a heartbeat file every 15 s that the healthcheck reads.
- **Data:** `app.canvas_import_jobs` (vault jobs share it), `app.canvas_imports`, `app.marker_jobs`, `app.ingestion_jobs`, `app.imported_file_cache` and its `_chunks`, `_assets` and `_note_updates` tables, `app.import_scheduler_classes`, `app.import_scheduler_users`. BullMQ queues `canvas-import`, `extract-retry` (drain only), `chat-generation`, `marker-dispatch`. S3 `imports/shared/<sha>.pdf`, `imports/shared-assets/…`, `canvas/<user>/<course>/…`. Qdrant user points and cache points under the `__imported_file_cache__` sentinel user. The heartbeat file in `os.tmpdir()`.
- **External:** Canvas API, Redis/BullMQ or Cloudflare Queues, PostgreSQL, S3, Qdrant, embeddings, Marker.
- **Code:** `src/lib/canvas/worker-entry.ts`, `job-dispatch.ts`, `import-*.ts`, `execution*.ts`, `extraction-retry.ts`, `canvas-folders.ts`, `cancel-import-jobs.ts`, `trash-conflicts.ts`, `src/lib/worker/` (`consumers.ts`, `periodic.ts`, `heartbeat.ts`, `maintenance.ts`), `src/lib/queue.ts`, `src/lib/hooks/use-canvas-import-status.ts`.
- **Docs:** [import pipeline](import-pipeline.md), [import-worker runbook](../operations/import-worker.md), [reliability handover](canvas-import-queue-reliability-handover.md).

## 12. Canvas MCP

Canvas tools for chat, through a hosted subset of the vendored Canvas MCP server.

- **Entry points:** `POST /api/mcp/canvas`, called server to server by the chat MCP client. The standalone server in `src/lib/canvas-mcp/` is not deployed.
- **Flow:** chat mints a 15 minute internal token, opens an MCP client to the app's own endpoint, and the route loads the user's Canvas credentials and builds a fresh server per request. Tools in `tool-policy.ts` (GET only) run directly; every other tool becomes a stored proposal the user approves at `/chat/actions/[id]`. The hosted profile has 83 of the 126 tools; 43 educator and admin tools are disabled.
- **Data:** `app.login` Canvas credentials, `app.chat_tool_actions`. No Redis, S3 or Qdrant.
- **External:** the user's Canvas REST API.
- **Code:** `src/app/api/mcp/canvas/route.ts`, `src/lib/canvas/mcp.ts`, `src/lib/canvas/tool-policy.ts`, `src/lib/auth/internal-mcp-token.ts`, `src/lib/chat/canvas-mcp-client.ts`, `src/lib/canvas-mcp/` (own package and tests).
- **Docs:** [Architecture: Canvas MCP boundary](architecture.md#canvas-mcp-boundary), the package [README](../../src/lib/canvas-mcp/README.md) and [tool manifest](../../src/lib/canvas-mcp/TOOL_MANIFEST.md).

## 13. Vault

ZIP import and export of a user's whole library, and Clear Vault.

- **Entry points:** Settings "Data & Export". Routes `POST /api/vault/import` (presigned PUT), `/api/vault/import/start`, `/api/vault/export`, `GET /api/vault/status`, `DELETE /api/vault/jobs/[jobId]/cancel`, `DELETE /api/vault` (Clear Vault). Worker jobs `vault-import` and `vault-export`; artifact cleanup every 5 minutes.
- **Flow:** import reserves an upload slot, the browser PUTs straight to S3, and start checks the object and queues the job. The worker streams the ZIP entry by entry, creates folders by title, stores each file, and runs extraction for documents. Export streams notes into a multipart ZIP upload and offers a 24 hour link. Archive paths are unique per folder (a ` (2)` suffix for same-named siblings), text notes export their current content rather than the original upload, and renamed uploads get their extension back. Jobs heartbeat per file; the status, import-start and export routes expire dead jobs (30 min processing, 2 h queued).
- **Data:** `app.canvas_import_jobs` rows of type `vault-import`/`vault-export`, `app.vault_artifacts`, notes, tree items, attachments and chunks. Advisory locks for the user tree, the global upload quota and per-user export. S3 `vault-uploads/<user>/…`, `vault/<user>/<job>/<uuid>/<file>`, `exports/<user>/<job>/vault-export.zip`.
- **External:** S3 directly through the SDK (multipart, presign), Marker, embeddings, email.
- **Code:** `src/lib/vault/` (`zip-stream.ts`, `import-worker.ts`, `export-worker.ts`, `tree-builder.ts`, `artifacts.ts`, `jobs.ts`), `src/app/api/vault/`, `src/components/settings/data-export-section.tsx`.
- **Docs:** [import-worker runbook](../operations/import-worker.md), [security rollout: vault retention](../operations/security-rollout.md#vault-retention).

## 14. Calendar and planning

The calendar, study blocks, the iCal feed and the Pomodoro timer.

- **Entry points:** `/calendar`. Routes `/api/time-blocks` and `/api/time-blocks/[id]`, `GET|POST /api/calendar/token`, public `GET /api/calendar/ical/[token]`, `POST|PATCH /api/pomodoro`. The Pomodoro controller is mounted in the root layout. Chat tools propose time-block changes.
- **Flow:** the calendar fetches blocks for exactly the visible month grid or week. Blocks are at most 24 h; queries are capped at 100 days and 1,000 rows. The feed token is issued on first `GET` and rotated by `POST`; the feed covers every dated assignment and blocks from 30 days back (a narrower window is an open decision). The Pomodoro timer runs on wall-clock end times, persists per tab, and credits `min(planned, elapsed + 1 min)` to the linked assignment only when an open focus session ends, once.
- **Data:** `app.time_blocks`, `app.pomodoro_sessions`, `app.login.calendar_export_token`, `app.assignments.logged_hours`. Browser `localStorage` `oghma-calendar`, `sessionStorage` `oghma-pomodoro`.
- **External:** none.
- **Code:** `src/lib/calendar/` (`ical.ts`, `time-blocks.ts`, `pomodoro.ts`), `src/components/calendar/`, `src/components/pomodoro/`, `src/lib/notes/state/{calendar,pomodoro}.ts`, `src/app/calendar/`.
- **Docs:** none beyond this page. `study-block-dialog.tsx` exists but isn't mounted, so only chat can create study blocks today.

## 15. Public site, telemetry and i18n

Marketing pages, agent discovery files, contact, anonymous counts and translations.

- **Entry points:** `/`, `/about`, `/blog` and `/blog/[slug]`, `/pricing`, `/privacy`, `/terms`, `/cookies`, `/contact`, `/info`, `/ai`, `/downloads`. Agent files `llms.txt`, `llms-full.txt`, `agents.md`, `ai.md`, `info.md`, `faq.md`, `pricing.md`, `auth.md`, `openapi.json`, `agent-api.json`, `agent-sitemap.xml`, `robots.ts`, `sitemap.ts`, `.well-known/*`. `POST /agent/identity` and its claim routes, `POST /api/contact`, `POST /api/marketing/events`, `/analytics` and `/api/admin/analytics`.
- **Flow:** locale comes from the `ogma-locale` cookie, then `Accept-Language`, then English; server and client both translate through `src/lib/i18n/translate.ts`. Contact checks origin, rate limits by IP, bounds the body, validates, stores a lead and emails it. Telemetry sends six allowlisted fields only when enabled and no DNT/GPC signal is present, and its endpoint is rate limited. The OpenAPI document is pinned to the real routes by a contract test.
- **Data:** `app.marketing_leads`, `app.marketing_events` (retention delete only), `app.agent_registration_claims` via auth. Redis rate-limit keys. Cookie `ogma-locale`, localStorage `oghma-telemetry-disabled`.
- **External:** email provider, the self-hosted telemetry collector, Unsplash images.
- **Code:** public pages in `src/app/`, `src/components/public/`, `src/lib/public/`, `src/lib/i18n/`, `src/lib/marketing/`, `src/lib/telemetry.ts`, `src/locales/`, `scripts/i18n-audit.ts`, `scripts/translate-locales.ts`.
- **Docs:** [agent compatibility](agent-compatibility.md), [anonymous usage counts](anonymous-telemetry.md), [positioning](../product/positioning.md).

## 16. Platform shell

The shared layer every route and component uses.

- **Entry points:** `src/instrumentation.ts` (`validateEnv()` and Sentry at startup), `GET /api/health` (`?readiness=chat`, diagnostics behind `x-health-secret`), `src/app/layout.tsx` (global providers), `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/components/navigation/`.
- **Contracts:** `withErrorHandler` and helpers in `api-error.ts` (trusted-origin check, `ApiError` mapping, bounded JSON). Zod schemas in `validations/schemas.ts`. The logger keeps only severity, a fixed category and a status class, and hands errors to Sentry before redaction when a DSN is set. Redis client with bounded per-command retries in `redis.ts`. Sliding-window rate limits with per-rule fail-open or fail-closed in `rate-limiter.ts` and `rate-limit-config.ts`. Strict positive-integer env parsing in `config.ts`.
- **Data:** Redis `rl:{id}:<category>` and `cache:{user}:settings` (the note and tree cache keys are still deleted in a few places but nothing reads them), `app.rate_limit_log`, the `ogma-theme` cookie.
- **External:** Redis, PostgreSQL, Sentry (optional).
- **Code:** top-level files in `src/lib/` (`api-error.ts`, `api-errors.ts`, `logger.ts`, `trace.ts`, `redis.ts`, `cache.ts`, `rate-limiter.ts`, `rate-limit-config.ts`, `config.ts`, `validate-env.ts`, `api-client.ts`), `src/lib/monitoring/`, `src/lib/validations/`, `src/lib/utils/`, `src/components/catalyst/`, `src/components/navigation/`.
- **Docs:** [Architecture: API routes](architecture.md#api-routes), [design system](design-system.md), [monitoring](../operations/monitoring.md).

## 17. Database, CI and infra

The database client, migrations, test tooling, CI and deploy.

- **Entry points:** `src/database/pgsql.ts` (lazy postgres.js client; TLS comes only from the URL's `sslmode`). `npm run migrate` runs `scripts/prebuild-migrate.ts` against `MIGRATION_DATABASE_URL`: legacy adoption, the one-off `migrate-pgvector-to-qdrant.ts` step, then `scripts/run-migration.ts --all`. E2E and mock tooling in `scripts/e2e/` and `scripts/dev/`. CI in `.github/workflows/` (`test.yml`, `build.yml`, `e2e.yml`, `mobile.yml`, `marker-tests.yml`). Deploy through Jenkins.
- **Flow:** the migration runner takes a per-database advisory lock, records a checksum per file, warns on edited applied files, refuses to re-run an applied file, and applies each pending file in its own transaction with a 3 s default `lock_timeout` and retries on lock conflicts. The disposable reset checks the database, Redis and Qdrant targets before wiping them.
- **Data:** every `app.*` table through migrations, `app.schema_migrations` (with `checksum`).
- **External:** PostgreSQL, and in e2e/mock only Redis, Qdrant and the S3 bucket.
- **Code:** `src/database/`, `database/migrations/`, `scripts/{prebuild-migrate,run-migration,migration-catalog,legacy-schema-contract}.ts`, `scripts/e2e/`, `scripts/dev/`, `Dockerfile`, `Dockerfile.worker`, `docker-compose*.yml`. The repository has no Jenkinsfile; the live pipelines are operator-owned and named in the [homelab runbook](../../infra/HOMELAB.md).
- **Docs:** [testing](testing.md), [database performance](database-performance.md), [homelab runbook](../../infra/HOMELAB.md).

## 18. Android app

The Expo shell that wraps the website in a WebView, with native sign-in, offline reading and updates.

- **Entry points:** `apps/mobile/App.tsx`, native modules `apps/mobile/modules/oghma-web-session` and `oghma-updater` (Kotlin). Web side: `/downloads`, `/auth/mobile/callback`, `src/lib/mobile-release.ts`, `src/lib/native-app.ts`, `src/components/providers/native-app-bridge.tsx`. Scripts `stage-mobile-apk.mjs` and `fetch-mobile-apk.mjs` (run in the Docker build).
- **Flow:** the WebView opens `/notes`. Google and GitHub sign-in run in the system browser with PKCE and return through a verified App Link; the shell exchanges the code at `/api/auth/mobile/exchange` and installs the session cookie natively. Bridge messages are size-limited and schema-checked. The offline reader stores up to 100 notes. The updater checks a manifest, downloads the APK and verifies size, SHA-256, package, versionCode and signer.
- **Data:** SecureStore `oghma.session.<host>`, `oghma.oauth.<host>` and migration flags; AsyncStorage `oghma.offline.v1.<host>` and a theme key; Android CookieManager. No server tables of its own; `public/downloads/android-alpha.json` is tracked.
- **External:** Expo and EAS Update, Android System WebView, GitHub releases (build only).
- **Code:** `apps/mobile/` (own package, lockfile and tests). See [`apps/mobile/README.md`](../../apps/mobile/README.md).
- **Docs:** [Android alpha](mobile-alpha.md), [security rollout](../operations/security-rollout.md).

## Keeping this page current

Update a section in the same change when a domain gains or loses an entry point, a table, a queue, an S3 prefix or a top-level folder. Leave behaviour detail to the linked docs. When a domain has no deeper doc and its section starts growing past a screen, give it its own page.
