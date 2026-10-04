# Database performance and integrity

> **Status:** Implemented in the working tree; not deployed
> **Last verified:** 2026-09-08
> **Source of truth:** Migrations 063 to 066, database client, query implementations, and database integration tests

## Implemented changes

- PostgreSQL server timeouts are nested under the Postgres.js `connection`
  option. Invalid pool/timeout integers fail early. App and worker sessions use
  distinct default application names. Defaults remain 20 connections per process,
  30 seconds per statement and 30 seconds idle in a transaction.
- Migration 063 makes the active-note index identical across the legacy and
  snapshot paths, adds stable chat-history and substring indexes, and removes
  known duplicate or unused indexes. It also restores quiz indexes omitted by
  the legacy test bootstrap. Substring matching remains language-independent;
  this does not introduce stemming or change searches to English token matching.
- Migration 064 adds owned-note, owned-parent, chat and quiz references. New
  writes are checked immediately. Existing rows are not deleted or rewritten.
  Question chunk IDs and review IDs remain historical provenance so reindexing
  does not erase learning history.
- Note listing has deterministic ordering by creation time and UUID, omits
  content, and emits `Server-Timing: db`. The response body is still an array.
  `X-Next-Cursor` can be passed as the next request's `after` parameter. Cursors
  preserve PostgreSQL microseconds. `skip` remains supported for older clients;
  do not combine it with `after`. Independent page caching was removed to avoid
  stale pagination after writes. Existing tree and single-note caches remain.
- Tree moves read only destination ancestors while retaining the per-user
  advisory lock and active-folder checks. `UNION` terminates traversal even if
  historical data already has a cycle.
- Course-scoped semantic search retrieves course note IDs in batches of 500
  before vector top-K selection, merging ranked candidates across pages. This
  requires no vector metadata backfill. Work still grows with course size;
  payload indexing is an alternative if measured latency warrants that change.
- Qdrant requests have a 10-second deadline. A whole upsert, including setup and
  all batches, has at most 15 seconds and at most half the configured idle
  transaction timeout. Index publication retains its note lock to protect the
  delete/index race. Failed vector deletion is journaled for worker retry.
- Migration 065 permits terminal generation payloads to be cleared after seven
  days. The existing worker retention pass clears at most 500 per pass. Messages,
  generation status and queued/running inputs remain. This intentionally bounds
  each maintenance statement; large backlogs take multiple passes.
- Migration 066 uses five-minute claims for external cleanup. Storage calls run
  without a database transaction. A token prevents an expired worker from
  acknowledging another worker's claim. Deletes are idempotent; a crash can
  cause a repeat after expiry. Vector-only cleanup does not initialize storage.
- Legacy migration adoption now verifies required tables/columns and fails
  instead of recording an incomplete schema as applied. The E2E bootstrap's
  historical SQL is shared through `scripts/e2e/legacy-schema.ts`.

## Verification commands

Run focused unit tests through `npm run test -- --run <test-file>`. The database
suite requires a disposable environment; it writes and deletes synthetic rows.
Use the existing E2E service workflow from [testing](testing.md), or create an
empty PostgreSQL database ending in `_audit_e2e` on a loopback host and set its
`DATABASE_URL` explicitly. Do not source application credentials for these checks.

```sh
node --experimental-strip-types scripts/db-audit-fixture.ts
npm exec -- vitest run -c vitest.integration.config.ts tests/integration/db
node --experimental-strip-types scripts/db-benchmark.ts
```

The fixture refuses to overwrite an existing app schema. A separate empty
fixture initialized with `--legacy-index-shape` simulates migration 018's older
active-note index. Compare final catalog definitions, not just index names.
The benchmark refuses a nonempty user table or a non-audit database. It inserts
synthetic data and temporarily drops two indexes inside a rolled-back
transaction, so it must never run on a shared database.

For an authorized read-only inventory of another environment:

```sh
node --experimental-strip-types scripts/db-audit.ts
```

That command enforces read-only sessions and a 10-second statement timeout. It
reports schema definitions, estimated live/dead rows, table/index sizes and
connection-state aggregates, without raw queries or application records. These
statistics do not provide endpoint percentiles, instantaneous CPU usage, or a
connection-pool wait histogram. Export no private records to a public report.

## Measured local evidence

Tests used a dedicated PostgreSQL 18 container limited to 1 CPU and 512 MB, with
loopback-only access and temporary storage. No production database was queried.
The workload contains one synthetic user and approximately 1.5 KB per note body.
These are PostgreSQL execution timings, not endpoint latency or capacity claims.
Each reported median uses 10 warm runs after two warmups. The comparison removes
only the two substring indexes inside a rolled-back transaction.

| 10,000-note search | Without substring indexes | With indexes after VACUUM ANALYZE |
| --- | ---: | ---: |
| Selective marker | 122.75 ms | 1.46 ms |
| No matches | 107.24 ms | 0.05 ms |
| Common word | 113.96 ms | 119.56 ms |
| Two-character substring | 113.05 ms | 113.60 ms |

Immediately after bulk insertion, before maintenance, selective searches were
about 110 ms on both paths. GIN pending entries, statistics and planner choices
matter. The common-word indexed case was slightly slower in this sample. Do not
promise a universal speedup or force index scans. Keep autovacuum/analyze healthy
and observe post-import behavior. Additional indexes trade storage and write work
for selective reads; this task does not establish a monthly infrastructure saving.

Database tests verify foreign-key rejection, a real statement cancellation,
simultaneous move-cycle prevention, microsecond-safe pagination, retention,
cleanup claim fencing, missing legacy columns and canonical indexes. The new
constraints also validated successfully against the clean synthetic fixture.

## Deployment and measurement still required

This work does not deploy, restart services or validate existing production rows.
Migrations 063 to 066 must run before the changed app and worker. Keep the prebuild
legacy check strict; a failure means inspect the missing structure, not mark more
versions as applied. The simulated legacy-index fixture is not proof that every
historical production schema is identical.

Migration 063 builds indexes in the existing transactional migration runner and
uses a three-second lock-acquisition limit. Large tables may exceed the deployment
runner's overall timeout or consume substantial temporary disk/WAL. Inspect sizes
and rehearse against a private disposable copy before rollout. If concurrent
builds are necessary, prepare a separately reviewed nontransactional migration
path; do not paste `CREATE INDEX CONCURRENTLY` into the current runner. See
[PostgreSQL index creation](https://www.postgresql.org/docs/current/sql-createindex.html).

Migration 064 uses `NOT VALID`, and 065's active-payload check does likewise.
Inspect the inventory's `convalidated` fields and investigate violations before
running `ALTER TABLE … VALIDATE CONSTRAINT …` in the target environment. This
scan is a separate deployment step; no legacy rows are silently removed to make
it pass. Review user deletion and quiz-history requirements before adding more
cascades to historical identifiers.

Budget connections as the sum of every app and worker process's pool maximum,
plus migration/admin reserve. Existing import and chat concurrency is bounded,
but actual pool pressure has not been measured. More connections are not an
assumed performance fix. PostgreSQL, Qdrant and object storage remain the existing
architecture. No new paid service or shared-chunk redesign is required.

A production rating needs representative endpoint p50/p95/p99, lock waits, pool
waits, import completion times, relation growth and post-import query plans.
Proposed starting budgets remain p95 database time below 50 ms for bounded
list/history reads and below 200 ms for keyword search on an agreed workload.
The local evidence is useful but does not establish those production budgets or
justify calling the deployed system 10/10.
