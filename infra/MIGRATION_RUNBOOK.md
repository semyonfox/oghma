# AWS Amplify To Homelab Migration Record

Status: completed. The current running stack is documented in [HOMELAB.md](HOMELAB.md), and the remaining AWS surface is documented in [AWS_INFRASTRUCTURE.md](AWS_INFRASTRUCTURE.md).

This file is retained as a historical record of the migration approach, not as the active deployment runbook.

## What Changed

| Old AWS service | Current replacement |
|---|---|
| Amplify web compute | Homelab Docker app containers behind Cloudflare tunnels |
| RDS PostgreSQL | `oghma-postgres` PostgreSQL 17 + pgvector container |
| ElastiCache / SQS worker path | Redis + BullMQ on `oghma-redis` |
| S3 app storage | RustFS S3-compatible object storage |
| Secrets Manager runtime config | Jenkins env files on the homelab |

AWS is now retained for Route 53, SES, and any explicitly documented external service.

## Migration Shape Used

The migration followed the standard low-downtime pattern:

1. Build the homelab stack in parallel.
2. Deploy prod/dev containers through Jenkins before DNS cutover.
3. Migrate PostgreSQL data into the homelab database.
4. Verify app, worker, database, storage, and queue health.
5. Switch DNS/Cloudflare routing to the homelab.
6. Keep rollback available by pointing DNS back while the old stack still existed.
7. Decommission AWS services only after stability was confirmed.

## Current Deploy Flow

- Push to `dev` for `dev.oghmanotes.ie`.
- Open a PR from `dev` to `main` for production.
- Jenkins builds app/worker images, runs migrations with `MIGRATION_DATABASE_URL`, swaps app/worker containers, and keeps recent image tags.

See [HOMELAB.md](HOMELAB.md) for exact container names and useful server commands.

## Future Return To AWS

If the project moves back to AWS, treat the homelab compose stack as the architecture template: app, worker, PostgreSQL/pgvector, Redis/BullMQ, S3-compatible storage, and optional Marker OCR. Do not resurrect the old Amplify/RDS/SQS/ECS split unless there is a specific reliability or capacity reason.

Before any AWS rebuild:

- Recheck live pricing in `eu-west-1`.
- Decide whether managed Postgres/object storage are worth the fixed cost.
- Keep the branch flow and migration process from the current Jenkins deploy.
- Update [AWS_INFRASTRUCTURE.md](AWS_INFRASTRUCTURE.md), [PRICING.md](../docs/PRICING.md), and [DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md) at the same time.
