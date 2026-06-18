# Target Hosting Plan

Status: launch target, not the current running stack.
Last updated: 2026-06-15.

Current production and dev still run on the homelab stack documented in [HOMELAB.md](HOMELAB.md). This document records the go-forward provider split for launch testing and migration planning. The target may change after load tests, provider trials, and real import benchmarks.

## Recommendation

Use Cloudflare for the edge and platform-adjacent services, but keep a normal Node runtime for the current app/worker shape unless the OpenNext trial proves clean.

| Area | Target |
|---|---|
| DNS, CDN, TLS, WAF/bot basics | Cloudflare |
| Web app trial | Cloudflare Workers + OpenNext, if compatibility is acceptable |
| Production fallback app runtime | Small Node/Docker host such as Railway, Fly, Render, or Hetzner/Coolify |
| Background worker | Node/Docker worker service consuming Cloudflare Queues over HTTP pull |
| Database | Neon Postgres with pgvector |
| Object storage | Cloudflare R2 via S3-compatible API |
| Transactional email | Cloudflare Email Sending |
| Human inboxes | Google Workspace |
| GPU processing | On-demand rented GPUs and batched runs |

## Cloudflare Scope

Cloudflare should own:

- DNS and proxying for `oghmanotes.ie`.
- TLS and edge caching.
- R2 object storage for uploaded files, exports, and generated assets.
- Email Routing for aliases where useful.
- Email Sending for verification, password reset, welcome, and job-complete messages.
- OpenNext/Workers trial for the web app.

Cloudflare should not be assumed to own the whole backend yet. The current repo uses a persistent BullMQ worker, Redis, Node streams, large uploads, PDF parsing, migrations, and optional GPU OCR hooks. Moving those pieces to Workers/Queues is a real migration, not a hosting flip.

Code reality:

- The app has 65 App Router API routes and currently builds as a standalone Node app.
- The import/export pipeline uses BullMQ, Redis, long-running worker processes, DB polling, timers, and signal handling in `src/lib/canvas/worker-entry.js`.
- Upload, Canvas, and vault routes enqueue BullMQ work directly.
- Production logging, PDF parsing, and storage proxying use Node-shaped libraries and streams in several paths.

That means Cloudflare Workers/OpenNext is a trial for the web app surface first. The worker stays Node/Docker; Cloudflare Queues can replace Redis/BullMQ through HTTP publish/pull without moving the long-running worker into Workers.

## OpenNext Trial Policy

Try Cloudflare Workers/OpenNext. Keep it if the app runs cleanly and the operational work is modest.

If it fails or forces a broad rewrite, use Cloudflare for edge/R2/email and deploy the app plus worker as Node containers elsewhere.

Known areas to test before committing:

- Auth and NextAuth callbacks.
- All 65 App Router API routes.
- Chat streaming.
- Postgres connectivity, ideally through a pooler or Hyperdrive-style connection handling.
- Upload/proxy routes that currently use Node streams and `Buffer`.
- Runtime bundle compatibility with AWS SDK, `postgres`, `nodemailer`, logging, and PDF parsing.
- Direct BullMQ enqueue paths from API routes.
- Build/deploy flow for migrations.

References:

- Cloudflare Workers Next.js guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext Cloudflare adapter: https://opennext.js.org/cloudflare
- Cloudflare Hyperdrive connection pooling: https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/

## Database Decision

Use Neon Postgres + pgvector.

MariaDB Vector is real and has native vector support in recent MariaDB versions, but it is not the right migration target for this app. Oghma already uses Postgres SQL, Postgres migrations, pgvector casts/operators, and Postgres-specific operational assumptions. Moving to MariaDB would force a database rewrite during launch without solving the main bottlenecks.

The current vector/search work depends on:

- PostgreSQL.
- pgvector.
- Existing migrations under `database/migrations/`.
- SQL written for Postgres semantics.

MariaDB can be reconsidered only if there is a separate strategic reason to move away from Postgres.

References:

- MariaDB Vector: https://mariadb.org/projects/mariadb-vector/
- MariaDB vector overview: https://mariadb.com/docs/server/reference/sql-structure/vectors/vector-overview
- Neon pgvector: https://neon.com/docs/extensions/pgvector
- pgvector: https://github.com/pgvector/pgvector

## Storage Decision

Use Cloudflare R2 as the launch object store.

R2 is a good fit because the app already uses S3-compatible storage and user file downloads can become expensive on egress-charging providers.

Migration caveat: keep object keys under the same `STORAGE_PREFIX` during copy, because database rows store logical keys below that prefix.

The main storage provider and vault import/export paths now use the same S3-compatible configuration: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PATH_STYLE`, and `STORAGE_PREFIX`.

References:

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 S3 API compatibility: https://developers.cloudflare.com/r2/api/s3/api/

## Email Decision

Use Cloudflare Email Sending for launch transactional mail.

Expected outbound volume is low: verification, password reset, welcome, and job-complete emails should stay well below the included 3,000 emails/month on Workers Paid during early launch.

Implementation: `src/lib/email.js` sends through the Cloudflare Email Service REST API from the Node app runtime. Configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, and `EMAIL_FROM`.

References:

- Cloudflare Email Service pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- Cloudflare Email REST API: https://developers.cloudflare.com/email-service/api/send-emails/rest-api/

## GPU Strategy

Do not buy always-on GPU capacity at launch.

Use on-demand GPU batches:

- H100 for batched first-import cohorts when enough backlog exists.
- 4080/4090-class workers for trickle imports when queue volume justifies it.
- No Datalab-style managed document API as steady-state processing because page volume makes it too expensive.

The Canvas import economics source of truth is [../docs/CANVAS_IMPORT_PRICING_REPORT.md](../docs/CANVAS_IMPORT_PRICING_REPORT.md).

## Historical Stacks

| Stack | Status | Use |
|---|---|---|
| AWS Amplify/RDS/SQS/ECS/S3/ElastiCache | Retired | Historical reference only |
| Homelab Docker/Jenkins | Current interim | Working production/dev stack, but not suitable as long-term launch hosting because ISP upload/reliability is a constraint |
| Cloudflare + Neon + R2 + small Node runtime + on-demand GPUs | Target | Launch migration candidate |
