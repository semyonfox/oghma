# Domain audit, October 2026

> **Status:** Historical record of the 2026-10-06 audit on branch `refactor/domain-audit-20261006` (base `df113e32` on `dev`), and of how it landed on `dev` on 2026-10-16. Context, not a runbook. The open decisions at the end are still open until someone records otherwise.
>
> **Last reviewed:** 2026-10-16
>
> **Where things live now:** the per-domain map is [Domains](../engineering/domains.md). The current contracts are in the docs it links to.

## What was audited and how

The whole app was split into 18 domains, listed in [Domains](../engineering/domains.md). Each domain was audited end to end, from UI through route and library code down to the database, queue or external service. Each pass fixed what it found, added tests that prove the fixes, and produced a report with a domain map, fixes, deferred items and doc impacts. The passes ran in parallel, each in its own worktree, with no access to live services: unit tests, typecheck and lint only.

An integration pass then merged the 18 patches into one worktree, numbered the new migrations (078 to 080 on the branch), and applied the cross-domain follow-ups that couldn't be made inside one domain's files: rate limits, Canvas job cancellation for deleted accounts, the remaining storage-contract fixes, reranker leftovers and env template cleanup. A separate docs pass produced the first version of this record. The branch was then committed as one commit per domain, plus a test commit and a docs commit, and `dev` was merged into it.

Verification on the final branch, against the disposable e2e stack:

- **Static checks:** typecheck and ESLint are clean.
- **Vitest:** 2,486 tests pass (baseline 2,130).
- **Canvas MCP suite:** 191 tests pass.
- **i18n audit:** OK.
- **Integration tests:** 94 of 94 pass. That includes the branch's migrations 078 to 080 applied to a fresh database. `tests/integration/study-map.test.ts` only runs against its dedicated database or in CI.
- **Playwright smoke:** everything passes except `chat-stream-order.spec.ts`. That spec fails 4 of 4 locally on unmodified `dev` as well. `chat-generation.spec.ts` passed 6 of 6.
- **Playwright full:** three failures that weren't compared against `dev` before this record was written:
  - **`note-references.spec.ts`:** a strict-mode clash on two "Saved" labels. The editor renders the same mobile and desktop headers on `dev`, so it is probably pre-existing.
  - **Two board-save checks in `study-map.spec.ts`:** the board route was not changed by the audit.
- **Not run here:** the worker Docker build and anything on a device.

The per-domain reports and the integration report are kept outside the repository.

## Production bug found during integration

Commit `fe7d9d77` (2026-10-05, already on `main`) added this statement to `permanentlyDeleteNotes` in `src/lib/notes/storage/note-lifecycle.ts`:

```sql
UPDATE app.canvas_import_jobs SET parent_folder_id = NULL ...
```

`parent_folder_id` exists on `app.canvas_imports` (migration 011), not on `app.canvas_import_jobs`. PostgreSQL rejected the statement, so the whole transaction rolled back. Every path that permanently deletes notes failed: emptying Trash, deleting a single Trash bundle, the worker's purge of expired Trash, and Clear Vault. The unit test used a SQL mock that accepted the statement, which is why it passed. The statement sat in `removeNoteRowsPermanently`, which every permanent-delete path shares. The fix shipped on its own in PR #596 and is on `dev` and `main`. It removes the statement, makes the mock reject the column, and adds `tests/integration/db/permanent-delete.test.ts`, which fails on the old code with `column "parent_folder_id" does not exist` and passes with the fix.

## Headline fixes by domain

Ordered by the most severe fix in each domain. These are the audit's findings; the [next section](#landing-on-dev-2026-10-16) records which fixes landed and in what form.

- **Notes and tree.** `GET /api/notes/:id` served a 10 minute Redis copy that extraction and imports never invalidated, so the editor could open stale content and autosave it over the newer row. The cache is gone. A rename racing an autosave wrote old content back; saves now lock the row and only change the fields sent. Restored notes whose folder was still in Trash were invisible; they now go to the root.
- **Auth and accounts.** Login leaked which emails exist (unknown addresses skipped bcrypt; deactivated accounts answered before the password check). The fail-open lockout fallback reset its counter on every call and never locked. Deleting an account left Auth.js cookies, reset links and the Canvas token alive, so imports kept running for deleted users.
- **Database, CI and infra.** The database client forced an `ssl` option that overrode the URL, so `sslmode=verify-full` and similar silently connected in plaintext. `scripts/standalone-migration.ts`, which dropped core tables on any `DATABASE_URL`, was deleted. The migration runner gained an advisory lock and checksums. The e2e reset could flush the shared homelab Redis and Qdrant from a stray shell export; it now checks every target.
- **Chat.** A rerun after a crash appended a second answer onto the old one in the replay stream, and a worker that lost its lease could keep writing. Sessions with a queued generation and a busy worker couldn't be deleted, and Stop failed when Redis was down.
- **Canvas import and worker.** A PDF that crashed the parser restarted the worker forever, taking every user's in-flight jobs with it. An unhandled rejection in a periodic task could exit the process. The healthcheck passed for a wedged worker; it now reads a heartbeat file. Queue publishes hung forever when Redis was down.
- **Extraction and Marker.** A replayed RunPod webhook could requeue a completion already running and redo indexing, or mark a published import failed. Abandoned RunPod jobs kept billing for up to 12 hours. The unused `POST /api/extract`, a second extraction pipeline that overwrote the source note, was deleted.
- **Canvas MCP.** The MCP client resent writes after a 5xx, so an approved submission or message could go to Canvas twice. The standalone server sent its env token to any caller-chosen host and couldn't start at all. The internal token expired after 60 s, mid-answer.
- **Vault.** Status polling silently discarded every response, so the UI sat on "Processing" until reload. A worker restart left jobs stuck forever and locked the user out. OCR companions could overwrite a user's own `.md` note. Exports shipped the original upload instead of the edited text.
- **Quiz.** FSRS learning steps weren't stored, so cards answered "good" never graduated and came back daily. Calendar review dots never showed. Skipping a card then reloading left the session stuck.
- **Calendar and planning.** The Pomodoro timer credited logged hours on every tick after a focus phase ended, and the end call wasn't idempotent. The calendar feed token was never issued, so the subscription URL never loaded.
- **RAG and search.** `reindex-all-notes.ts --force` deleted every user's vectors in one request; the flag is gone. The embeddings backfill could attach a vector to the wrong chunk, possibly another user's. Query embeddings could block search for about 4 minutes on a hung provider. The Search button did nothing on `/study-map`. The unused rerank modules were deleted.
- **Editor and Markdown.** Any failed note fetch, including going offline, closed the open note. Chat and quiz output could auto-load an off-site image, a zero-click exfiltration channel for prompt-injected content. Note-level PDF annotations were write-only and duplicated.
- **Storage and upload.** Canvas attachments with an unknown type were served inline, so a `text/html` file would run script on the app origin. `hasObject` reported an outage as "missing", and storage calls had no timeouts. Uploads could leave empty ghost notes.
- **Study maps.** A long lecture could be sent to the model as "the syllabus" and define the whole module's topics. An edited note was never reclassified. Renaming a map threw away paid classification results.
- **Canvas sync and assignments.** The raw export did all discovery before the first byte, so real accounts hit the proxy timeout; it now streams. Every sync reset a user's "done" tasks. Assignments deleted in Canvas stayed in the tracker as overdue.
- **Platform shell.** Redis commands queued forever while Redis was down, so callers hung instead of reaching their fallbacks. The health diagnostics returned database passwords containing punctuation.
- **Public site, telemetry and i18n.** Server and client translated missing keys differently, causing hydration mismatches. `/openapi.json` had drifted from the routes; a contract test now pins it. `/auth.md` told agents to poll faster than the rate limit allowed.
- **Android app.** An account re-confirmation arriving after an offline save made the save fail. The WebView user agent reported the wrong version.

## Landing on dev, 2026-10-16

The branch never merged as it was. By mid-October it conflicted with `dev` in 42 files, its migrations 078 and 079 collided with numbers `dev` had already used, and its intermediate commits didn't build. So the fixes were re-applied to `dev`'s current code one domain at a time, with one commit per domain:

| PR | Merged to `dev` | Domains |
|---|---|---|
| #596 | 2026-10-06 | The `permanentlyDeleteNotes` hotfix above, on its own (also on `main`) |
| #620 | 2026-10-15 | Four fixes that couldn't wait: the MCP client no longer resends writes after a 5xx, S3 copy sources are URL-encoded, stored files render inline only from an allowlist, and Canvas file locks are rechecked before import |
| #632 | 2026-10-16 | Auth and accounts, storage, Canvas MCP, public site, platform shell, database and CI |
| #633 | 2026-10-16 | Notes, editor, vault, RAG and search, quiz, calendar |
| #634 | 2026-10-16 | Marker, Canvas sync, the import worker, chat |
| #635 | 2026-10-16 | Study maps, Android app |

As of 2026-10-16 these are on `dev` only; `main` was last released from `dev` in #624 and doesn't include #632 to #635 yet.

How the ports were checked: each PR ran `npm run lint:all` (ESLint, i18n audit, typecheck and the unit suites) and the touched domain's tests. Test files that timed out while the host was under heavy load were rerun on their own and passed. The migration step was rehearsed on a restored 2026-10-15 production dump: migrations 080 and 081 applied and a second run was a no-op. The live env files were checked, without reading values, for settings whose parsing became strict. Integration and e2e suites ran in CI rather than locally, and the mobile app's TypeScript check couldn't run because no checkout had its `node_modules`.

### What changed on the way

- **Migrations were renumbered.** The branch's `learning_steps` column became migration 080, and its assignment float repair and foreign-key indexes (078 and 079 on the branch) became one migration, 081.
- **File moves were skipped.** The worker entry stays at `src/lib/canvas/worker-entry.ts`; only its new helpers live in `src/lib/worker/`. Canvas sync stays in `src/lib/canvas/sync-*.ts` and the raw export in `raw-export*.ts`, with no `sync/` or `raw-export/` folders. The chat folder split was dropped, so `src/lib/chat/` stays flat. `src/lib/notes/tree-cache.ts` was kept because the import and upload paths still call it.
- **Jenkinsfile changes were dropped.** The repository `Jenkinsfile` had been deleted by then; the live pipelines are operator-owned (see the [homelab runbook](../../infra/HOMELAB.md)). The branch's `docker-compose` edits were dropped too.
- **The pgvector step stays.** `scripts/migrate-pgvector-to-qdrant.ts` is kept because `prebuild-migrate.ts` still runs it.
- **Rerank settings stay.** The unused rerank modules were deleted, but the `RERANK_*` entries in the env templates, the e2e workflow and `ai-config.ts` were left alone. Nothing reranks search results.
- **Proxy matcher cleanup moved.** #632 kept the matchers for `/api/extract` and `/api/import-export` because those routes still existed; #633 and #634 deleted the routes and their matchers.
- **Dev's newer work won where it overlapped.** #612's 30-day purge of deleted accounts replaced the branch's open hard-delete item, #623's lock-conflict retry stayed in the migration runner, `dev`'s `expectedUpdatedAt` 409 now runs under the new row lock, and `dev`'s 8 MiB vault export parts were kept.
- **Held back for a device test.** The Android sign-in cleanup (`api`, `contracts`, `oauth`) and the theme rewrite sit on the App Link path that shipped on 2026-10-15 and hasn't been tested on a phone.
- **Product calls left as `dev` had them.** The branch's 180/365-day calendar feed window was dropped, so the feed keeps every dated assignment. The branch's automatic retry after a source-changed study-map failure was dropped, so those still need a manual retry.

## Decisions still open

These were left alone on purpose: they change product behaviour, cost money, touch production config, or need a call from Semyon. Grouped by area, most pressing first. Items closed since the audit are listed after them.

### Data, privacy and accounts

- **Account recovery.** Deleted accounts are purged after 30 days (#612), and the address is free again after that. Inside the window, restoring an account is a manual support step with no tooling, and registering an existing address sends no email at all. Pick a recovery story.
- **Cookie and privacy copy.** The cookie page describes language and theme as browser storage without naming the `ogma-locale` and `ogma-theme` cookies, and the privacy policy doesn't state the 365-day contact-lead retention.
- **Vault import folder strategy.** Imports merge into the existing tree by folder title. Importing into a new `Imported <zip> <date>` folder would make re-imports tidy and rollback a one-folder delete. A failed import also keeps what it created so far.
- **Canvas data in chat.** File tools hand pre-authenticated Canvas URLs to the model; `canvas_send_conversation` can message a whole course from one approval; quiz-question tools are readable during an attempt.

### Security

- **JWT audience checks.** `verifyJWTToken` in `src/lib/auth/session.ts` pins HS256 but accepts any token signed with `JWT_SECRET`, with no audience or issuer check. The internal MCP token now uses a derived key and its own audience, but every token type should carry and check its own `aud`.
- **MCP origin order.** The chat MCP client builds its URL from the request origin before `APP_BASE_URL`. That is only safe while the proxy controls `Host`; preferring `APP_BASE_URL` or a fixed internal origin would remove the dependency.
- **Worker container runs as root.** `Dockerfile.worker` has no `USER`; the app Dockerfile already shows the pattern.
- Per-email login lockout lets anyone lock a known address for 30 minutes. Logout doesn't revoke the JWT; a "sign out everywhere" action would be cheap.
- `/agent/identity` answers 409 for an existing account, which enumerates emails (rate limited and consistent with register). Expired agent claims are never swept.

### Operations

- **Logger redaction.** Since 2026-10-04 the logger keeps only a severity and a fixed category. Sentry error and trace reporting was added on 2026-10-08 but stays off until a DSN is set in the Jenkins env files (see [monitoring](../operations/monitoring.md)). Without it, worker and chat logs say something failed but not what, and the `traceId` returned in every error body matches nothing. Recommendation: allow `traceId`, a timestamp and a short allowlist (queue, job name, task, error name).
- **`CANVAS_CLAIM_RECOVERY` stays off.** A worker killed during download or discovery leaves the job "processing" forever. Follow the release gates in the [reliability handover](../engineering/canvas-import-queue-reliability-handover.md), enable it in dev, then prod.
- **Shutdown grace.** Docker gives 10 s and `WORKER_SHUTDOWN_GRACE_MS` defaults to 5 s, so long extractions are redone after every deploy. Option: `docker stop -t 60` with `WORKER_SHUTDOWN_GRACE_MS=55000` in the live pipelines.
- **Chat recovery** can republish a generation indefinitely across lease expiries; add a maximum age.
- **Marker.** Cancelling a Canvas import doesn't cancel the RunPod job.
- **Migrations.** A non-transactional mode for `CREATE INDEX CONCURRENTLY`, validating the `NOT VALID` constraints from 064 and 065, and checking the live `max_connections` against 20 per process across four containers.
- **Pipelines and repo hygiene.** The live pipelines would benefit from `disableConcurrentBuilds()` and a pinned `qdrant/qdrant` tag. Dependabot has no `github-actions` entry. `report.tex` and `report.pdf` sit in the public repo root.
- Health checks don't cover Qdrant or S3; `REDIS_TLS=true` also forces cluster mode; `metrics.ts` is all no-ops.

### Product and UX

- **Canvas pruning.** Assignment sync now deletes rows Canvas stopped listing after a complete read. A Canvas `200` with an empty list would therefore delete that course's tasks.
- **Canvas:** planner sync is written but never called; a user's edits to Canvas assignment titles and dates are reverted by sync; disconnecting leaves imports running; a token decrypt failure gives a 500 on every Canvas route.
- **Study-block dialog isn't mounted.** Only chat can create study blocks. Mount it or delete it.
- **Calendar feed date window.** The feed includes every dated assignment, however old. Deadline events run from `due_at` to one hour later, so 23:59 deadlines spill into the next day. There's no way to turn the feed off.
- **Editing a note retires its quiz cards.** Re-indexing mints new chunk ids, so questions point at chunks that no longer exist. Stable chunk ids in `replaceNoteEmbeddings` would fix it. Bloom levels also never go above 1, and cards already in learning restart at step 0 after migration 080.
- **Chat:** a second message while one is generating isn't rejected; sessions load every message unpaginated; injected content can fill the 30 pending-action cap; `executing` actions never recover.
- **Study maps:** auto maps can't keep "no syllabus"; reconciliation visits each map about every 36 minutes at 100 users; the snapshot poll is heavy. A failure because the source changed mid-run still needs a manual retry; whether it should retry on its own needs confirming.
- **Search:** a semantic failure returns `200 []`, indistinguishable from no matches; course-scoped search runs one Qdrant query per 500 notes.
- **Storage:** no orphan sweeper for unreferenced objects; uploads use about 3x the file size in memory; no HTTP Range support, so media can't seek.
- **Settings** are one S3 object written read-modify-write, so concurrent saves lose updates.
- **PDF annotations API** has no client: build the UI or delete it.
- **Android:** the updater can lock out "Download again" until restart; four native dependencies are unused; the custom `ie.oghmanotes.alpha` URL scheme is unused; "Could not restore sign-in" is a dead end; blob downloads do nothing in the WebView. These need a native build.
- **Public:** telemetry forwards at most 20 events a minute for all users; `robots.txt` has no `Disallow: /api/`; pricing, telemetry strings and page metadata are English-only.

### Closed since the audit

- **Hard-delete job:** built in #612. The worker purges soft-deleted accounts daily once their 30 days are up.
- **`POST /api/notes/[id]/share`:** deleted in #633. It had no caller and let any user drop a note into another user's tree by UUID.
- **Last-write-wins saves:** the editor sends `expectedUpdatedAt` and the notes route answers a stale save with 409, under the row lock since #633. Saves no longer wait on embedding; the worker reindexes from a `note-reindex` job.
- **Migration runner timeouts:** the runner sets a 3 s default `lock_timeout` and retries lock conflicts (#623), and `prebuild-migrate.ts` gives each step five minutes.
- **`global-error.tsx`:** added.

## Docs changed

In the 2026-10-16 port of the audit's docs:

- Added [Domains](../engineering/domains.md), the [vector index rebuild runbook](../operations/vector-index.md) and this record.
- Moved to history: the Milkdown [migration handover](2026-07-15-markdown-editor-migration-handover.md) and [spike report](2026-07-15-markdown-editor-spike-report.md) (Milkdown shipped), the [architecture history](2026-10-06-architecture-history.md), and the [retired growth analytics design](2026-10-04-growth-analytics-retired.md). The [history index](README.md) maps the old paths.
- Updated to match `dev`: the [documentation index](../README.md), architecture, import pipeline, file-tree coordination, split-pane editor, Markdown rendering, testing, database performance, agent compatibility, the Canvas data emergency plan, the reliability handover, the launch checklist, pricing, the roadmap, and the chat, import-worker, RunPod, Vast and security-rollout runbooks. Smaller merges went into the study-map and Android alpha docs and `infra/HOMELAB.md`, which `dev` had already updated.
