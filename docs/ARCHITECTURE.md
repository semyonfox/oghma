# Architecture for a new contributor

Status: current walkthrough, reviewed 2026-11-27 against the files named on this page.

Read this to find where a change goes. The running boundaries stay in [Architecture](engineering/architecture.md). Per-area routes, tables and folders stay in [Domains](engineering/domains.md). Operator commands stay in [the homelab runbook](../infra/HOMELAB.md). Local setup stays in [the project README](../README.md).

## App structure

OghmaNotes is a Next.js application plus a separate Node worker. `package.json` names the package `oghmanotes`, depends on `next` 16.4.6 and `react` 19.3.1, and sets `engines.node` to `^24.15.0 || >=26.0.0`. The `dev` script runs `next dev`. The `worker` script runs `src/lib/canvas/worker-entry.ts`.

Pages and route handlers live under `src/app`. Signed-in product pages include `src/app/notes/page.tsx`, `src/app/chat/page.tsx`, `src/app/quiz/page.tsx`, `src/app/calendar/page.tsx`, `src/app/study-map/page.tsx` and `src/app/settings/page.tsx`. The root layout in `src/app/layout.tsx` mounts locale, theme, the native-app bridge, Canvas import notifications, the Pomodoro controller, server events and global search.

Server code is grouped by area under `src/lib`. [Architecture](engineering/architecture.md) lists those folders. A module that outgrows one file gets sibling files with a shared prefix, and the layout has no `index.ts` barrel. One-file clients at the top of `src/lib` include `queue.ts`, `qdrant.ts`, `redis.ts`, `config.ts` and `ai-config.ts`.

JSON route handlers use `withErrorHandler` and `requireAuth` from `src/lib/api-error.ts`. The database client is the postgres.js wrapper in `src/database/pgsql.ts`. The Android shell is the separate package `apps/mobile`, mapped in [Domains](engineering/domains.md).

Inference. The split between `src/app` and `src/lib` follows the directory tree. No single file declares it.

## Data model

Relational state is the PostgreSQL schema `app`. `scripts/e2e/baseline-schema.ts` says production never runs that snapshot. Disposable boots do, then the migration catalog. `scripts/prebuild-migrate.ts` applies pending files from `database/migrations/` using `MIGRATION_DATABASE_URL`, and records them in `app.schema_migrations`. [Architecture](engineering/architecture.md) treats that table as the record of what a database has applied.

`scripts/e2e/baseline-schema.ts` creates the early tables. Accounts are `app.login` and `app.oauth_accounts`. Notes are `app.notes`, with one tree row each in `app.tree_items`, plus `app.attachments` and `app.pdf_annotations`. Chunk text is `app.chunks`, and `document_id` points at a note. Chat rows start as `app.chat_sessions` and `app.chat_messages`. Canvas runs start as `app.canvas_import_jobs` and per-file `app.canvas_imports`. `database/migrations/008_rag_tables_consolidation.sql` creates those same RAG, chat and Canvas tables with `CREATE TABLE IF NOT EXISTS`.

Later migrations add what the current features use. `database/migrations/030_qdrant_embeddings.sql` drops `app.embeddings` and, when no vector column remains, the `vector` extension. `database/migrations/042_resumable_chat_generations.sql` creates `app.chat_generations`. `database/migrations/054_marker_serverless_jobs.sql` creates `app.marker_jobs`. `database/migrations/055_note_links.sql` creates `app.note_links`. `database/migrations/059_note_trash_and_cache_retention.sql` adds `trash_root_id` and creates `app.note_deletion_cleanup_tasks`. `database/migrations/071_study_maps.sql` creates the study-map tables. `database/migrations/074_chat_tool_confirmation.sql` creates `app.chat_tool_actions`. The per-area list stays in [Domains](engineering/domains.md).

Vectors live in Qdrant. `src/lib/qdrant.ts` upserts points whose payload carries `chunk_id`, `document_id`, `user_id` and `searchable`, into `QDRANT_COLLECTION` or the default `oghma_chunks`. Object bytes go through `src/lib/storage/`. [Domains](engineering/domains.md) says the live app uses Cloudflare R2 and that other stores are selected with `STORAGE_*`. Queue transport is Redis through `src/lib/queue.ts`.

`app.notes` gained columns after the baseline. `database/migrations/056_canvas_ids_bigint.sql` widens `canvas_course_id`, `canvas_module_id` and `canvas_assignment_id` to `bigint`. `database/migrations/085_note_edited_at_and_module_position.sql` adds `edited_at` and `canvas_module_position`. Its comment says `updated_at` also moves on imports, extraction, reindexing, pins and moves, so a recent-edit sort has to use `edited_at`. `database/migrations/072_account_session_version.sql` adds `app.login.session_version`.

## Notes and Canvas

A note and its tree row are one write. `createNoteWithTree` in `src/lib/notes/storage/create-note.ts` takes the user-tree lock and rejects a parent that is not an active folder owned by that user. `src/lib/notes/README.md` says some import paths write notes on their own.

Trash keeps the rows. `moveSubtreeToTrash` in `src/lib/notes/storage/note-lifecycle.ts` sets `deleted_at`, `trash_root_id` and `trash_expires_at` on the active subtree in one transaction, then hides the vectors. `restoreTrashRoot` clears those three columns for rows with that `trash_root_id`, and inserts a root tree row when the old one is gone. `database/migrations/059_note_trash_and_cache_retention.sql` defines `trash_root_id` as the group of a deleted folder and its descendants. Permanent deletion is the other path in `note-lifecycle.ts`. [Architecture](engineering/architecture.md) says it removes relational dependents and records Qdrant and object cleanup on `app.note_deletion_cleanup_tasks`.

Canvas material is stored as notes and folders in `app.notes`. `findCanvasFolder` in `src/lib/canvas/canvas-folders.ts` selects a folder by `canvas_course_id`, `canvas_module_id` and `canvas_assignment_id`. `CanvasFolderTrashedError` in that file refuses a trashed folder as the live match. `canvasModulePosition` in the same file writes the lecturer's module order into `canvas_module_position`.

An import run is a row in `app.canvas_import_jobs`. Each file is a row in `app.canvas_imports`. Both tables are in the baseline snapshot and in `database/migrations/008_rag_tables_consolidation.sql`. Worker message names are the switch in `src/lib/canvas/job-dispatch.ts`. `canvas-discover`, `canvas-file` and `canvas-extract` are the current Canvas stages. `canvas-import` is still accepted for messages already queued. `extract` and `extract-retry` cover direct uploads and retries. `vault-import` and `vault-export` use the same dispatcher. Stage order and tuning stay in [Import pipeline](engineering/import-pipeline.md).

## AI and retrieval

Samuel Regan wrote the original RAG pipeline. Commit `b1e60561`, dated 2026-03-17, is authored as trailmix-ship-it at `232815077+SamuelRegan-dev@users.noreply.github.com`. The message says he implemented the RAG pipeline, changed the SQL layout for a vector table, and switched the reranker to Cohere. `src/app/about/page.tsx` lists Samuel Regan with `https://github.com/SamuelRegan-dev`. `README.md` names him as one of the three people who started the project.

Inference. That commit's author field is trailmix-ship-it. The credit to Sam follows the GitHub noreply address and the same GitHub name on the about page.

The running pipeline stores vectors in Qdrant. `database/migrations/030_qdrant_embeddings.sql` drops `app.embeddings`. [Architecture](engineering/architecture.md) says the unused rerank modules were deleted in #633. `src/lib/ai-config.ts` still defines `RERANK_TOP_N` and `RERANK_MIN_RELEVANCE`. Later commits on `src/lib/rag/` are by Semyon Fox, including the Qdrant move and the worker reindex.

Indexing starts from note text. `chunkText` in `src/lib/rag/chunking.ts` splits on sentence boundaries at `RAG_CHUNK_SIZE`, 500 characters by default from `src/lib/ai-config.ts`, with no overlap. An oversized sentence is cut so a chunk stays within twice that size. `embedChunks` in `src/lib/rag/embeddings.ts` strips Markdown, prefixes each chunk with `Instruct: Represent this document for retrieval`, and calls the configured OpenAI-compatible embeddings endpoint. `replaceNoteEmbeddings` in `src/lib/rag/indexing.ts` mints ids, locks the live note row, writes `app.chunks`, and upserts the same ids through `src/lib/qdrant.ts`. A failed Qdrant delete inserts `app.note_deletion_cleanup_tasks`.

The saving request enqueues reindex. Embedding runs in the worker. `reindexNote` in `src/lib/rag/note-reindex.ts` reads the current `content`, skips the embed when `extracted_text` already matches, and the file comment says a change during embedding fails the stamp check and requeues the job. The worker handles `note-reindex` in `src/lib/canvas/job-dispatch.ts`.

Search checks ownership twice. `searchChunkVectors` in `src/lib/qdrant.ts` requires payload `user_id` to match. `hydrateOwnedNoteChunks` in `src/lib/rag/owned-note-chunks.ts` then loads chunk text only when `app.chunks.user_id` and `app.notes.user_id` match, and the note is not deleted and not a folder. `embedText` uses one attempt of 10 seconds per endpoint, `QUERY_EMBED_OPTIONS` in `src/lib/rag/embeddings.ts`. Chat calls this from `searchChatChunks` in `src/lib/chat/chunk-search.ts`, which also runs an `ILIKE` search over chunk text and note text. `useRag` defaults to true on `POST /api/chat` in `src/app/api/chat/route.ts`.

That route has two transports. When `stream` and `background` are both set, it creates a generation, enqueues it, and returns HTTP 202 with `generationId`. Other requests stream or return JSON in the web process. Replay, cancellation and the `getAppGuide` tool stay in [Architecture](engineering/architecture.md) and [the chat runbook](operations/chat.md).

Reindex keeps quiz cards attached when it can. `carryGeneratedQuestions` in `src/lib/rag/indexing.ts` moves a generated question onto the new chunk when the old and new text match once each. It deletes a generated question that was never reviewed when the text changed. A reviewed question keeps its old `chunk_id`. The comment in that file calls `chunk_id` provenance.

## Auth

Password sign-in goes through `src/lib/auth/password-login.ts`. The result is `ok`, `rate_limited`, `invalid`, `deactivated` or `unverified`. The file hashes with bcrypt and counts attempts through `src/lib/auth/login-lockout.ts`. OAuth goes through `src/lib/auth/oauth.ts`. `resolveVerifiedOAuthEmail` lives there. `OAuthAccountUnavailableError` covers a deactivated or soft-deleted account. The link transaction takes advisory locks on the provider account id and the email, then can insert the getting-started note with `insertNoteWithTree`.

`validateSession` in `src/lib/auth/session.ts` checks two cookies. A `session` cookie is verified as an HS256 JWT with audience `oghma-session` and issuer `oghmanotes`. The `app.login` row must match `session_version`, and must be verified, active and not deleted. With no usable `session` cookie, the same function accepts an Auth.js session and runs the same row checks. `requireAuth` in `src/lib/api-error.ts` uses that check for route handlers.

`src/proxy.ts` only looks for a session cookie, including chunked Auth.js cookies, via `hasSessionCookie`. Its `matcher` covers `/login`, `/register`, a few public markdown paths, and `/notes`, `/chat`, `/settings`, `/api/notes`, `/api/chat`, `/api/tree`, `/api/trash`, `/api/upload` and `/api/settings`. A signed-out page on those prefixes redirects to `/login`. A signed-out `/api/*` request on those prefixes returns 401. `src/app/quiz/page.tsx` and `src/app/study-map/page.tsx` call `validateSession` themselves and redirect. `src/app/calendar/page.tsx` is a client page outside the matcher. Its data route `src/app/api/time-blocks/route.ts` calls `requireAuth`. Logout clears cookies in `clearSessionCookies`. A bumped `session_version` is what makes an old token fail the next `validateSession` call. The column comes from `database/migrations/072_account_session_version.sql`.

## Background jobs

`src/lib/queue.ts` is the publish boundary. The base names are `canvas-import`, `extract-retry`, `chat-generation` and `marker-dispatch`, each prefixed from the environment. An empty or `bullmq` `QUEUE_PROVIDER` selects BullMQ. `cloudflare` selects the HTTP publisher in the same file. [Architecture](engineering/architecture.md) says BullMQ is the homelab mode, and that the Cloudflare publisher is the migration target.

`src/lib/canvas/worker-entry.ts` starts consumers before periodic work. `processCanvasJob` sends Canvas, extraction, Marker, vault and note-reindex messages through `dispatchCanvasJob`. Chat generation is a separate consumer. Its concurrency defaults to 2 through `CHAT_GENERATION_CONCURRENCY`. Marker dispatch is its own consumer.

The file comment says every periodic task is non-overlapping. They are the heartbeat, queue repair every 30 seconds, stuck-job settlement every 5 minutes, vault artifact cleanup every 5 minutes, study jobs every 5 seconds, study-map reconciliation every minute, and daily maintenance. Daily maintenance prunes chat payloads, marketing data, the imported-file cache and study caches, purges expired trash, runs note-deletion cleanup, deletes expired `app.chat_tool_actions`, reconciles trashed vector visibility, and purges deleted accounts. The heartbeat interval is 15 seconds and the healthcheck treats a file older than 60 seconds as dead. Both constants are in `src/lib/worker/heartbeat.ts`. The `worker:healthcheck` script in `package.json` runs `scripts/worker-healthcheck.ts`.

The worker comment says `docker stop` sends SIGKILL after 10 seconds by default. `WORKER_SHUTDOWN_GRACE_MS` defaults to 90 seconds so an in-flight chat answer can finish when the deploy stop timeout is longer than that grace.

## Deploy

`main` is production and `dev` is development. `AGENTS.md` and `infra/HOMELAB.md` both say Jenkins job `oghma-prod` tracks `main` and serves `oghmanotes.ie`, and job `oghma-dev` tracks `dev` and serves `dev.oghmanotes.ie`. `README.md` builds the two images from `Dockerfile` and `Dockerfile.worker`. Jenkins applies migrations with `scripts/prebuild-migrate.ts` before the app swap. The step list and rollback commands stay in `infra/HOMELAB.md`. This checkout has no Jenkinsfile. [Domains](engineering/domains.md) says the live pipelines are operator-owned.

Inference. The live Jenkins controller was not opened for this page. The branch mapping is what `AGENTS.md` and `infra/HOMELAB.md` say. The runbook header says the controller was last verified on 2026-09-02.

## Where to add a feature

Start from [Domains](engineering/domains.md) and open the folder it names.

A note change belongs in `src/lib/notes/` and the matching handler under `src/app/api/notes/`. A Canvas import change belongs in `src/lib/canvas/`. A new queue message needs a case in `src/lib/canvas/job-dispatch.ts` and a handler passed from `src/lib/canvas/worker-entry.ts`. A retrieval change belongs in `src/lib/rag/` and the Qdrant calls in `src/lib/qdrant.ts`.

A new column is a new file in `database/migrations/`, numbered after the highest file already there. `AGENTS.md` says migrations `001-017` are the legacy set and later files continue from that highest number. The file has run on a database only when `app.schema_migrations` contains it.

A new JSON route should use `withErrorHandler`, `requireAuth`, `parseJsonObject` and `validateBody`. Those helpers are exported from `src/lib/api-error.ts`, and the zod schemas live in `src/lib/validations/schemas.ts`. The worked example is in [Architecture](engineering/architecture.md). Slow work belongs in a row the worker can claim. Chat does that when `stream` and `background` are both set, in `src/app/api/chat/route.ts`. A new page is covered by `src/proxy.ts` only after its path is added to `config.matcher`. Quiz and the study map show the other pattern, a `validateSession` check in the page.

After the code change, update the matching section in [Domains](engineering/domains.md). Update [Architecture](engineering/architecture.md) when the change moves relational or vector ownership, the queue provider, the worker model, the hosted Canvas MCP policy, or the chat or import flow. That page lists those as the boundaries that move with the code. Note and Canvas tests are named in `src/lib/notes/README.md` and `src/lib/canvas/README.md`. Suite commands stay in [Testing](engineering/testing.md).

## Inferences

Three claims above are marked Inference.

The `src/app` and `src/lib` split is read from the tree.

Samuel Regan is the person behind the trailmix-ship-it author field on commit `b1e60561`. The commit message, the noreply address and `src/app/about/page.tsx` are the evidence.

The deploy branch mapping was not rechecked on the live controller.
