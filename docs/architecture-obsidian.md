# OghmaNotes Architecture Atlas (Obsidian)

Created: 2026-06-11
Status: Current homelab/code snapshot, not the launch target.

Launch target note: this file describes the running homelab architecture derived from `main`, `infra/HOMELAB.md`, and `Jenkinsfile`. For the go-forward paid-launch provider split, use `../infra/TARGET_HOSTING.md`: Cloudflare DNS/edge/email/R2, Neon Postgres + pgvector, Cloudflare Workers/OpenNext if the trial is clean, otherwise a small Node/Docker runtime, and on-demand GPU batches for import processing.

## 1) System-Level Architecture

OghmaNotes is currently a **Next.js App Router monolith** plus a **separate BullMQ worker** container, both deployed from `main`/`dev` branches through Jenkins onto a homelab Docker stack.

```mermaid
flowchart TD
  User["User Browser"]

  subgraph Edge["Edge & Delivery"]
    DNS["Cloudflare DNS/Tunnel\nRoute 53 historical/fallback"]
    Tunnel["Cloudflare Tunnel"]
    Nginx["nginx reverse proxy\nprod/dev routing"]
  end

  subgraph Homelab["Homelab (10.0.0.5)"]
    AppProd["oghma-prod app\nNext.js SSR + API"]
    AppDev["oghma-dev app\nNext.js SSR + API"]
    WorkerProd["oghma-prod-worker\nBullMQ worker"]
    WorkerDev["oghma-dev-worker\nBullMQ worker"]
    Postgres["PostgreSQL 17 + pgvector"]
    Redis["Redis 7 (cache + rate limit + queues)"]
    Rustfs["RustFS / S3-compatible storage"]
  end

  subgraph Services["External services"]
    LLM["LLM provider (k2.5 default)"]
    Embed["Embedding provider (Qwen / OpenRouter)"]
    Rerank["Reranker provider"]
    OCR["Marker / GPU batch path\nDatalab historical/fallback only"]
    Email["Cloudflare Email Service\ntransactional mail"]
    Canvas["Canvas LMS API"]
  end

  User --> DNS --> Tunnel --> Nginx
  Nginx --> AppProd
  Nginx --> AppDev

  AppProd --> Redis
  AppProd --> Postgres
  AppProd --> Rustfs
  WorkerProd --> Redis
  WorkerProd --> Postgres
  WorkerProd --> Rustfs

  AppDev --> Redis
  AppDev --> Postgres
  AppDev --> Rustfs
  WorkerDev --> Redis
  WorkerDev --> Postgres
  WorkerDev --> Rustfs

  AppProd --> LLM
  AppProd --> Embed
  AppProd --> Rerank
  AppProd --> OCR
  AppProd --> Email
  AppProd --> Canvas

  WorkerProd --> OCR
  WorkerProd --> Canvas
```

## 2) Deployment and runtime pipeline

```mermaid
flowchart TD
  DevBranch["Push to dev"] --> Jenkins["Jenkins pipeline (manual webhook)"]
  MainBranch["Push to main"] --> Jenkins

  Jenkins --> Build["Parallel: npm install + next build / worker image build"]
  Build --> Migrate["prebuild-migrate.mjs"]
  Migrate --> DeployApp["Deploy app container + health check"]
  DeployApp --> DeployWorker["Deploy worker container"]
  DeployWorker --> Cleanup["Image prune + keep last tags"]
```

- Branch mapping:
  - `dev` branch → `oghma-dev` / `oghma-dev-worker`
  - `main` branch → `oghma-prod` / `oghma-prod-worker`
- Env + images are passed from `Jenkinsfile` and stored in `/home/semyon/jenkins/env/{oghma-prod,oghma-dev}.env`.
- Container stack command in dev uses `docker-compose` with static names and fixed IPs.
- Migrations run via `scripts/prebuild-migrate.mjs` against `MIGRATION_DATABASE_URL`.

## 3) Request flow overview (UI → API → domain logic)

```mermaid
flowchart LR
  Browser["Browser/SPA stateful pages"] --> Router["Next.js App Router"]
  Router --> Auth["Auth + session guard"]
  Router --> Notes["Notes/Tree/Attachments"]
  Router --> Chat["Chat + session"]
  Router --> Search["Search + RAG"]
  Router --> Planner["Assignments / Pomodoro / Calendar"]
  Router --> Quiz["Quiz / FSRS"]
  Router --> Vault["Vault import/export"]
  Router --> Canvas["Canvas import"]
  Auth --> DB["PostgreSQL app schema"]
  Notes --> Storage["S3-compatible object store (RustFS)"]
  Chat --> Redis["Redis cache/rate limit"]
  Search --> DB
  Planner --> DB
  Quiz --> DB
  Vault --> DB
  Canvas --> DB
  Storage --> Notes
  Chat --> RAG["Embedding + rerank + LLM services"]
```

## 4) Domain inventory by filesystem

### App layer (`src/app`)

- **Pages / UI shells**: `about`, `blog`, `calendar`, `chat`, `notes`, `quiz`, `pricing`, `settings`, `syntax-guide`, `login/register/password/reset/verify`, etc.
- **API route roots**:
  - `assignments`
  - `auth`
  - `calendar`
  - `canvas`
  - `chat`
  - `courses`
  - `extract`
  - `health`
  - `import-export`
  - `ingestion-status`
  - `mcp`
  - `notes`
  - `pdf`
  - `pomodoro`
  - `quiz`
  - `search`
  - `settings`
  - `time-blocks`
  - `trash`
  - `tree`
  - `upload`
  - `vault`

### Full API route inventory (all `route.ts` / `route.js` files found)

- `src/app/api/assignments/route.ts`
- `src/app/api/assignments/[id]/route.ts`
- `src/app/api/assignments/sync/route.js`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/avatar/route.ts`
- `src/app/api/auth/avatar/image/route.ts`
- `src/app/api/auth/change-password/route.js`
- `src/app/api/auth/delete-account/route.ts`
- `src/app/api/auth/login/route.js`
- `src/app/api/auth/logout/route.js`
- `src/app/api/auth/me/route.js`
- `src/app/api/auth/password-reset/request/route.js`
- `src/app/api/auth/password-reset/verify/route.js`
- `src/app/api/auth/register/route.js`
- `src/app/api/auth/resend-verification/route.js`
- `src/app/api/auth/verify-email/route.js`
- `src/app/api/calendar/ical/[token]/route.ts`
- `src/app/api/calendar/token/route.ts`
- `src/app/api/canvas/connect/route.js`
- `src/app/api/canvas/courses/route.js`
- `src/app/api/canvas/import/route.js`
- `src/app/api/canvas/logs/route.js`
- `src/app/api/canvas/status/route.js`
- `src/app/api/canvas/sync/route.js`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/sessions/route.ts`
- `src/app/api/chat/sessions/[id]/route.ts`
- `src/app/api/chat/sessions/[id]/messages/[messageId]/route.ts`
- `src/app/api/courses/settings/route.ts`
- `src/app/api/courses/settings/[courseId]/route.ts`
- `src/app/api/extract/route.ts`
- `src/app/api/health/route.js`
- `src/app/api/import-export/route.ts`
- `src/app/api/ingestion-status/route.ts`
- `src/app/api/mcp/canvas/route.ts`
- `src/app/api/notes/route.js`
- `src/app/api/notes/[id]/route.js`
- `src/app/api/notes/[id]/assets/route.ts`
- `src/app/api/notes/[id]/share/route.ts`
- `src/app/api/pdf/annotations/route.js`
- `src/app/api/pomodoro/route.ts`
- `src/app/api/quiz/cards/[id]/route.ts`
- `src/app/api/quiz/dashboard/route.ts`
- `src/app/api/quiz/dashboard/courses/route.ts`
- `src/app/api/quiz/questions/[id]/related/route.ts`
- `src/app/api/quiz/review-dates/route.ts`
- `src/app/api/quiz/sessions/route.ts`
- `src/app/api/quiz/sessions/[id]/route.ts`
- `src/app/api/quiz/sessions/[id]/answer/route.ts`
- `src/app/api/quiz/streak/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/settings/route.ts`
- `src/app/api/time-blocks/route.ts`
- `src/app/api/time-blocks/[id]/route.ts`
- `src/app/api/trash/route.ts`
- `src/app/api/tree/route.ts`
- `src/app/api/tree/children/route.ts`
- `src/app/api/tree/status/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/vault/route.ts`
- `src/app/api/vault/export/route.ts`
- `src/app/api/vault/import/route.ts`
- `src/app/api/vault/import/start/route.ts`
- `src/app/api/vault/jobs/[jobId]/cancel/route.ts`
- `src/app/api/vault/status/route.ts`

## 5) Library/services inventory (`src/lib`)

- **Core platform**
  - `api-error.ts`, `auth.ts`, `auth.config.ts`, `logger.ts`, `xray.ts`, `metrics.ts`, `trace.ts`, `cache.ts`, `redis.ts`, `rateLimiter.ts`, `rateLimitConfig.ts`
- **Persistence and storage**
  - `storage/*` abstraction layer (`StoreS3`, init, logger, s3 tools)
  - `notes/storage/*` (`pg-tree.js`, `s3-storage.ts`, `note-cleanup.ts`)
  - `auth-oauth.ts`, `crypto.ts`, `email.js`
- **Notes + document pipeline**
  - `notes/*`, `ingestion/extraction-core.ts`, `extract*` flow, `rag/indexing.ts`, `ingestion-status`, `chunking.ts`
- **AI/RAG**
  - `ai-config.ts`, `embeddings.ts`, `rerank.ts`, `providers/self-hosted-*`
  - `chat/*` (rag pipeline, tool calling, streaming SSE, sessions, prompts, normalizers, hooks)
- **Canvas import platform**
  - `canvas/*`, `queue.ts`, `canvas-mcp/*`
  - `canvas/worker-entry.js`, `canvas/import-worker.js`, `canvas/import-discovery.js`, `canvas/import-extraction.js`, `canvas/import-embedding.js`, `extraction-retry.ts`
- **Vault import/export**
  - `vault/import-worker.js`, `vault/export-worker.js`, `vault/tree-builder.js`
- **Search/Quiz/Planner**
  - `quiz/*`, `assignments` routes (shared tables)
  - `pomodoro` components + API
  - `calendar` related modules

## 6) Data persistence & state topology

```mermaid
flowchart LR
  App["Next.js App"]
  Worker["BullMQ Worker"]
  DB["PostgreSQL app schema"]

  subgraph DBTables["Schema families"]
    Identity["Identity: app.login"]
    Notes["Notes: notes / tree_items / attachments / shared metadata / markdown + extracted_text"]
    Ingestion["Ingestion: canvas_imports / canvas_import_jobs / ingestion_jobs / rate_limit_log"]
    Search["RAG: chunks / embeddings (pgvector) / chat_messages / chat_sessions / pdf_annotations"]
    Planner["Planner: assignments / time_blocks / pomodoro / user_course_settings / user_streaks"]
    Quiz["Quiz: quiz_questions / quiz_cards / quiz_sessions / quiz_reviews"]
    Misc["Vault: schema_migrations / migration metadata / file jobs / logs"]
  end

  App -->|SQL| DB
  Worker -->|SQL| DB
  App -->|cache/rate-limit| Redis[(Redis)]
  Worker -->|queue control| Redis
  App -->|object upload/download| S3["RustFS (S3-compatible)"]
  Worker -->|object download/upload| S3
  App --> DBTables
```

### Storage model rules

- Notes metadata/tree + quotas mostly in PostgreSQL.
- Raw attachments and derived assets in S3-compatible storage.
- AI vectors remain in PostgreSQL pgvector.
- Queue metadata and progress are also in PostgreSQL (`app.canvas_import_jobs`, `app.canvas_imports`).

## 7) Ingestion + background job architecture

```mermaid
flowchart TD
  A["/api/upload / /api/canvas/import / /api/vault/import/start"] --> B["Insert DB rows in app.canvas_import_jobs / ingestion_jobs / notes"]
  B --> C["enqueueCanvasJob(type,payload)"]
  C --> Q["BullMQ queues"]
  Q -->|canvas-import| W1["Canvas/ingestion worker"]
  Q -->|extract-retry| W2["Worker retry lane"]
  W1 --> D1["Canvas discover/download -> process file"]
  W1 --> D2["Extraction + OCR (if configured)"]
  W1 --> D3["Chunk + embed + PG vector upsert"]
  W1 --> D4["Import progress + cancel handling"]
  W2 --> D2
  W1 --> Seed["Quiz seed + background generation"]
  A2["/api/vault/export"] --> C
  A3["/api/vault/import/start"] --> C
```

- Worker safety:
  - Job retries via BullMQ options
  - DB-level orphan recovery (`stuck` + `orphaned`) in `worker-entry.js`
  - Cancellation supported via `cancel_requested_at` and idempotent terminal-state updates.

## 8) RAG + Chat architecture

```mermaid
flowchart TD
  Msg["POST /api/chat"] --> Sess["validateSession + rateLimit + scope"]
  Sess --> Rag["runRagPipeline(query, scopedNoteIds)"]
  Rag --> KV["pgvector ANN search on chunks"]
  KV --> RR["rerankChunks (provider or fallback)"]
  RR --> Prompt["buildSystemPrompt + session memory"]
  Prompt --> LLM["LLM generate / stream response"]
  LLM --> Persist["persistMessage(session)"]
  Persist --> Store["Chat sessions + messages in PostgreSQL"]
  LLM --> Stream["SSE stream (text/tool event)"]
  Sess --> NonStream["non-stream JSON mode"]
```

- Chat supports streaming and non-stream mode from `/api/chat`.
- Session context and message parts are stored for replay.
- Tooling hook path exists (`canvas-tooling`, MCP client routes) for structured assistant actions.

## 9) Frontend and page architecture

- App pages route under `src/app` are organized around:
  - Study workspace (notes, chat, tree)
  - Planner (`calendar`, `assignments`, `time-blocks`, `pomodoro`)
  - Learning (`quiz`, `quiz sessions`)
  - Settings/profile/auth flows.
- Components are grouped by domain under `src/components/{calendar,chat,notes,pomodoro,quiz,settings,layout,...}` and share domain hooks/state providers in corresponding `src/lib/*/state` folders.
- Common UI patterns and tokens are maintained in `docs/design-system.md`, `src/app/globals.css`, and `tailwind.config.js`.

## 10) Security / policy / resilience notes

- Auth providers:
  - Google OAuth, GitHub OAuth, and credentials login via `Credentials` strategy in `next-auth`.
- Security controls:
  - CSP + security headers in `next.config.mjs`
  - Trusted origin checks in `api-error.ts`
  - Password hashing via `bcryptjs`
  - Redaction in logger output for secrets
  - Signed URLs/keys via storage provider
- Resilience:
  - Redis fallback to memory rate limiter when unavailable.
  - BullMQ queue fallback for stuck job reclamation.
  - Worker includes explicit failure and retry handling, plus DB audit logs.
- Operational:
  - App/worker memory profiles and process swap policy managed by Jenkins + Docker compose.

## 11) Migrations and operations checklist

- Migration files tracked in `database/migrations`:
  - `001` through `029`, with gaps where historical legacy versions were dropped/archived.
- App migration sequence:
  - `scripts/prebuild-migrate.mjs` bootstraps legacy version entries.
  - `scripts/run-migration.mjs --all` applies pending files using `app.schema_migrations` tracking.
- CI/CD expects successful `prebuild-migrate` before app startup in deploy stages.

## 12) Quick dependency map (external)

- PostgreSQL: `postgresql://...` (`DATABASE_URL` / `MIGRATION_DATABASE_URL`)
- Redis: `REDIS_HOST`/`REDIS_PORT` (queue + rate limit + cache)
- Storage: `STORAGE_*` environment variables (S3-compatible bucket, endpoint, creds, prefix)
- AI/Docs: `LLM_*`, `EMBEDDING_*`, `RERANK_*`, optional `DATALAB_API_KEY`, optional `MARKER_API_URL`
- Email/notifications: Cloudflare Email Service REST API using `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, and `EMAIL_FROM`.
- Auth callbacks: `GOOGLE_*`, `GITHUB_*`, credentials flags/env secrets.

---

This file is a compact architecture atlas. Provider decisions belong in `../infra/TARGET_HOSTING.md`.
