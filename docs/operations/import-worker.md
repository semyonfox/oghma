# Import Worker Runbook

> Status: Active workload runbook
>
> Audience: OghmaNotes operators and import-pipeline maintainers
>
> Last verified: 2026-07-22 against the worker, queue facade, R2 browser upload,
> Jenkinsfile, and tracked environment templates

This runbook covers Canvas import, extraction retry, and vault import/export
workloads. General container deployment, migrations, and rollback belong in
[the homelab runtime guide](../../infra/HOMELAB.md).

## Runtime Shape

| Concern                  | Current implementation                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker process           | `npm run worker`, which starts `src/lib/canvas/worker-entry.ts`                                                                                  |
| Job state                | `app.canvas_import_jobs`, including its vault-specific job columns                                                                               |
| Queue facade             | `src/lib/queue.ts`                                                                                                                               |
| Current homelab provider | Redis/BullMQ                                                                                                                                     |
| Optional provider        | Cloudflare Queues HTTP publish/pull when `QUEUE_PROVIDER=cloudflare`                                                                             |
| Object storage           | S3-compatible provider selected by the `STORAGE_*` environment                                                                                   |
| Vector storage           | Qdrant, with per-environment collections injected by Jenkins                                                                                     |
| Extraction               | Local parsers first; Marker uses either direct `MARKER_API_URL` or queued `RUNPOD_MARKER_ENDPOINT_ID`, and remains gated by `MARKER_OCR_ENABLED` |

The queue provider is selected through the facade. API routes and workers
should not bypass it with provider-specific calls.

## Queue Names and Jobs

`src/lib/queue.ts` prefixes queue names. Jenkins currently supplies:

| Environment | Prefix      | Canvas queue              | Retry queue               |
| ----------- | ----------- | ------------------------- | ------------------------- |
| Production  | `oghma`     | `oghma-canvas-import`     | `oghma-extract-retry`     |
| Development | `oghma-dev` | `oghma-dev-canvas-import` | `oghma-dev-extract-retry` |

The Canvas queue handles `canvas-discover`, `canvas-file`, `extract`,
`marker-complete`, `marker-failed`, `vault-import`, `vault-export`, and the legacy
`canvas-import` job name retained for in-flight compatibility. New delayed
extraction retries return to the Canvas queue so fresh and retried work share
worker capacity. The retry queue consumer remains enabled to drain messages
created before this change.

Canvas per-file work is released by a database-backed weighted fair scheduler.
The `free`, `semester`, and `academic_year` service classes receive 1:3:5
shares, users rotate within a class, and only one file per user is dispatched
at once. Paid entitlement comes from verified local
`app.login.import_service_class` state.

The worker also polls the database as a safety net for Canvas import/sync
discovery jobs that were accepted but not enqueued cleanly. It cannot recreate
arbitrary direct-extraction, retry, or vault payloads. That mechanism is
recovery, not a substitute for queue health.

## Configuration Truth

There are three distinct values to discuss:

1. **Code default**: used only when the variable is absent.
2. **Tracked production-template value**: the conservative value in
   `.env.production.template`.
3. **Live value**: held in the private Jenkins env file and intentionally not
   reproduced in this repository.

| Variable                                 |                           Code default | Production template |
| ---------------------------------------- | -------------------------------------: | ------------------: |
| `CANVAS_GLOBAL_FILE_CONCURRENCY`         |                                    `6` |                 `2` |
| `CANVAS_OCR_CONCURRENCY`                 |                                    `2` |                 `1` |
| `CANVAS_EMBED_CONCURRENCY`               |                                    `3` |                 `1` |
| `CANVAS_FILE_TIMEOUT_MS`                 | `600000` in the import extraction path |            `600000` |
| `CANVAS_POLL_INTERVAL_MS`                |                                 `3000` |              `3000` |
| `MARKER_OCR_ENABLED`                     |                                `false` |             `false` |
| `QUEUE_PROVIDER`                         |                               `bullmq` |            `bullmq` |
| `REDIS_HOST`                             |                            `localhost` |       `oghma-redis` |
| `REDIS_PORT`                             |                                 `6379` |              `6379` |
| `CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_MS` |                             `43200000` |          `43200000` |

Do not infer live production tuning from either default column. Check variable
presence and container configuration without printing secret values.

Jenkins also passes `MARKER_OCR_ENABLED=false` explicitly to deployed app,
worker, smoke-test, and retry-drain containers. That command-line value wins
over the private env file. Enabling Marker in a deployed environment therefore
requires an intentional deployment-code change as well as a configured URL;
an env-file edit alone cannot enable it.

Queued RunPod extraction additionally requires the endpoint/API credentials, a
high-entropy webhook token, a public HTTPS app base URL, and
`STORAGE_PUBLIC_ENDPOINT`. Oghma submits one document to `/run`; the worker
downloads the source and uploads full JSON through short-lived signed object
URLs. The webhook contains only completion metadata and re-enters this worker
through `marker-complete` or `marker-failed`. `app.marker_jobs` correlates the
callback and makes retries observable. Keep `MARKER_PROCESS_ALL_PDFS=false` to
retain the text-layer-first path; enable it only for a controlled quality run.

Cloudflare queue mode additionally requires the account ID, queue IDs, and a
Queues API token named by `.env.example`. It still uses the long-running Node
worker; changing the queue provider does not move extraction into a Worker.

Jenkins injects the Qdrant endpoint and per-environment collections documented
in the [homelab runtime guide](../../infra/HOMELAB.md). Keep collection naming
with deployment topology instead of duplicating it in this workload runbook.

## Browser uploads to object storage

Vault imports upload directly from the browser to the configured S3-compatible
endpoint before the app creates a worker job. The storage service must be
browser-reachable and allow the app origin to send `PUT`, `Content-Type`, and
`x-amz-meta-expected-size`.

The desired live R2 policy is tracked in
`scripts/cloudflare/r2-cors.json`. CORS is bucket-wide, so the shared
`oghma-notes` bucket includes both deployed origins. Jenkins must not apply or
reconcile this policy during normal app deployments.

Before changing the policy, confirm the Cloudflare identity and inspect the full
current configuration:

```bash
npx wrangler whoami
npx wrangler r2 bucket cors list oghma-notes
```

`cors set` replaces the bucket policy. Preserve any existing rules in the
tracked file before applying it, then use the non-interactive command only after
reviewing the complete diff:

```bash
npx wrangler r2 bucket cors set oghma-notes \
  --file scripts/cloudflare/r2-cors.json \
  --force
npx wrangler r2 bucket cors list oghma-notes
```

A successful command-line upload is not sufficient verification because it does
not enforce browser CORS. Finish with a small dev vault import and confirm the

## Deployment Verification

After the normal Jenkins deployment:

1. Confirm the app and worker containers are running.
2. Check the worker health command used by Jenkins:
   `npm run worker:healthcheck`.
3. Review recent worker logs for queue connection, database connection, Qdrant
   collection, and recovery-loop errors.
4. Confirm recent migrations in `app.schema_migrations`.
5. Inspect job counts by status.
6. Run a small dev import before using a large course or vault.

Useful read-only checks on the homelab:

```bash
docker ps --filter name=oghma
docker logs oghma-dev-worker --tail 120
docker logs oghma-prod-worker --tail 120
```

Treat logs as potentially sensitive. Redact user identifiers, private object
paths, authenticated URLs, and tokens before sharing them outside the operator
group.

Useful SQL:

```sql
SELECT version, name, applied_at
  FROM app.schema_migrations
 ORDER BY applied_at DESC
 LIMIT 10;

SELECT status, COUNT(*)
  FROM app.canvas_import_jobs
 GROUP BY status
 ORDER BY status;

SELECT COALESCE(l.import_service_class, 'free') AS service_class,
       COUNT(*) FILTER (WHERE ci.status = 'pending' AND ci.dispatched_at IS NULL) AS waiting,
       COUNT(*) FILTER (WHERE ci.dispatched_at IS NOT NULL AND ci.status IN ('pending', 'downloading', 'processing', 'indexing')) AS active
  FROM app.canvas_imports ci
  JOIN app.login l ON l.user_id = ci.user_id
 GROUP BY 1
 ORDER BY 1;
```

## Dev Smoke Test

- Connect a test Canvas account.
- Import one small course or file.
- Confirm the accepted job progresses beyond `queued`/`discovering`.
- Confirm the file becomes visible before indexing finishes where the two-phase
  path applies.
- Confirm extraction completes or reports an actionable failure.
- Confirm Qdrant receives searchable chunks before testing cited chat.
- Run a small vault export and verify that its completion/download flow works.
- Avoid large real-user imports as a routine deployment probe.

## Tuning

Change one limiter at a time. Observe worker memory, Redis/BullMQ health,
PostgreSQL load, Qdrant latency, extraction latency, provider rate limits, and
failed/retried jobs before increasing another value.

The tracked production template is intentionally more conservative than code
defaults. Document any deliberate live override in the private operations
runbook, not here.

For workload economics and GPU batching decisions, use
[the dated Canvas import cost study](../research/2026-06-14-canvas-import-costs.md).
Do not enable a managed document API as the steady-state path without
re-evaluating that model.

## Troubleshooting

### Worker does not pick up jobs

- Confirm the worker container and `npm run worker:healthcheck`.
- Confirm `QUEUE_PROVIDER`.
- For BullMQ, check the environment-specific prefixed queue and Redis
  connectivity.
- For Cloudflare Queues, check configured queue IDs, token permission, pull
  errors, and acknowledgement errors without printing the token.

### Jobs remain queued or discovering

- Check enqueue errors first.
- Check the worker's database recovery loop.
- Confirm environment prefixes match between app and worker.
- Look for a deployment where app and worker loaded different env files.

### Jobs remain indexing

- For direct mode, check extraction errors and `MARKER_API_URL` reachability.
- For queue mode, inspect `app.marker_jobs`, RunPod job status, the public
  signed-storage hostname, and `pending_marker` records without logging URLs or
  tokens.
- Check `CANVAS_OCR_CONCURRENCY` and provider timeouts.
- Check embedding-provider responses and Qdrant connectivity.
- Confirm the note/job terminal-state guards are preventing duplicate work.

### Vault jobs conflict

Active vault import/export routes intentionally reject conflicting work unless
the caller explicitly chooses the supported replacement/cancellation path.
Do not retry a partial vault import blindly; its retry-safety constraints are
documented in `src/lib/queue.ts`.

### Migration or vector-store failure

Stop workload verification and use the homelab deployment guide. Do not edit
`app.schema_migrations` or rerun data migrations ad hoc from this runbook.

## Related Sources

- [Current homelab runtime](../../infra/HOMELAB.md)
- `Jenkinsfile`
- `src/lib/queue.ts`
- `src/lib/canvas/worker-entry.ts`
- `src/lib/canvas/import-extraction.js`
- `src/lib/canvas/import-embedding.js`
- `scripts/worker-healthcheck.mjs`
