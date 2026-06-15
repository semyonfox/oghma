# Canvas And Vault Import Deployment Guide

Current deployment target: homelab Docker containers managed by Jenkins. Older ECS/SQS/CloudWatch deployment notes were condensed into [OPTIMIZATION_SUMMARY.md](OPTIMIZATION_SUMMARY.md) as historical context.

Launch hosting target: [../infra/TARGET_HOSTING.md](../infra/TARGET_HOSTING.md). Canvas import economics and GPU batching model: [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md).

## Runtime Shape

| Component | Current path |
|---|---|
| App | `oghma-dev` / `oghma-prod` Next.js containers |
| Worker | `oghma-dev-worker` / `oghma-prod-worker` running `npm run worker` |
| Queue | BullMQ on `oghma-redis:6379` |
| Job table | `app.canvas_import_jobs` |
| Storage | RustFS/S3-compatible bucket |
| OCR | Optional `MARKER_API_URL`; fallback extraction when unset or unavailable |

Worker job names live on the `canvas-import` and `extract-retry` queues. Current names include `canvas-discover`, `canvas-file`, `extract`, `marker-complete`, `vault-import`, `vault-export`, and the legacy `canvas-import` handler for in-flight compatibility.

## Deploy Flow

1. Push changes to `dev`.
2. Jenkins job `oghma-dev` builds the app and worker images.
3. Jenkins runs `node scripts/prebuild-migrate.mjs` with `MIGRATION_DATABASE_URL`.
4. Jenkins replaces `oghma-dev` and `oghma-dev-worker`.
5. Verify on `https://dev.oghmanotes.ie`.
6. Open a PR from `dev` to `main`.
7. After merge, Jenkins job `oghma-prod` deploys production.

Do not push directly to `main`.

## Environment Knobs

Set these in `/home/semyon/jenkins/env/oghma-dev.env` and `/home/semyon/jenkins/env/oghma-prod.env`.

| Variable | Default in code | Purpose |
|---|---:|---|
| `CANVAS_GLOBAL_FILE_CONCURRENCY` | `6` | Total concurrent Canvas file tasks |
| `CANVAS_OCR_CONCURRENCY` | `2` | Concurrent extraction/OCR tasks |
| `CANVAS_EMBED_CONCURRENCY` | `3` | Concurrent embedding writes |
| `CANVAS_FILE_TIMEOUT_MS` | `600000` in import worker | Per-file import timeout |
| `CANVAS_POLL_INTERVAL_MS` | `3000` | Client/status polling interval |
| `REDIS_HOST`, `REDIS_PORT` | `localhost`, `6379` | BullMQ connection |
| `MARKER_API_URL` | unset | Enables Marker OCR |
| `DATALAB_API_KEY` | unset | Historical/emergency external extraction fallback; not steady-state launch processing |

Also keep `DATABASE_URL`, `MIGRATION_DATABASE_URL`, storage keys, email transport keys, auth secrets, and AI provider keys in sync with [../SETUP.md](../SETUP.md).

## Verification

After a deploy, check the app, worker, queue, and database state:

```bash
ssh semyon@server
docker ps --filter name=oghma
docker logs oghma-dev --tail 80
docker logs oghma-dev-worker --tail 120
docker exec -it oghma-postgres psql -U oghma_admin oghma
```

Useful SQL:

```sql
SELECT version, name, applied_at
  FROM app.schema_migrations
 ORDER BY version DESC
 LIMIT 5;

SELECT status, COUNT(*)
  FROM app.canvas_import_jobs
 GROUP BY status
 ORDER BY status;
```

Manual smoke test:

- Connect Canvas in dev.
- Import a small course/file.
- Confirm the file appears in the tree before full indexing completes.
- Confirm job status reaches `complete` or an actionable failure.
- Ask chat/search about the imported content after indexing.
- Run a vault export and confirm the download URL is returned.

## Tuning Guidance

Start conservative on the homelab. Raise one knob at a time while watching worker logs, Redis health, PostgreSQL load, and extraction latency.

| Profile | File | OCR | Embed | Use |
|---|---:|---:|---:|---|
| Conservative | `4` | `1` | `2` | First prod beta, low risk |
| Balanced | `6` | `2` | `3` | Current default intent |
| Aggressive | `10` | `3` | `5` | Only if OCR and DB are keeping up |

If files sit in `indexing` too long, investigate OCR first, then embedding provider latency, then database writes.

Do not use managed document APIs such as Datalab as the steady-state import path without rechecking the Canvas pricing report. The current launch plan is on-demand GPU batching once the queue volume justifies it.

## Troubleshooting

**Worker not picking up jobs:** confirm `REDIS_HOST`/`REDIS_PORT`, worker container health, and `docker logs oghma-*-worker`.

**Files stuck in `queued` or `discovering`:** the worker has a DB safety-net that re-enqueues orphans. If rows stay stuck, check worker errors and Redis connectivity.

**Files stuck in `indexing`:** check `MARKER_API_URL`, extraction fallback logs, provider rate limits, and `CANVAS_OCR_CONCURRENCY`.

**Vault export/import conflicts:** routes intentionally return `409` for active jobs unless the caller explicitly forces cancellation/replacement.

**Bad migration state:** inspect `app.schema_migrations`, then re-run the Jenkins job after fixing the migration. Migrations are expected to be idempotent.

## Rollback

For code regressions, revert the offending commit on `dev`, verify, then promote the revert through the normal PR flow for production. Jenkins keeps recent tagged images, but the preferred rollback path is source-controlled unless the server is unhealthy and needs an immediate image swap.
