# Import Optimization Record — 2026-04-01

> Status: Historical evidence; not an operations runbook
>
> Recorded environment: Retired AWS ECS/Fargate import worker
>
> Current operations: [Import worker runbook](../operations/import-worker.md)

This record preserves the outcome reported when the Canvas and vault import
pipeline was optimized on 2026-04-01. The deployment, metrics, provider
resources, commands, and rollback process from that date are superseded by the
homelab Docker/Jenkins runtime.

## Changes Recorded at the Time

- Added bounded concurrency for file processing, OCR, and embedding work.
- Split file availability from final indexing so imported files could appear
  before RAG indexing completed.
- Added Marker readiness caching, prewarming, and worker keep-warm controls for
  the then-current AWS worker design.
- Added richer import status reporting and extraction retry support.

The recorded tuning baseline was:

| Concern | Recorded value |
|---|---:|
| File concurrency | `6` |
| OCR concurrency | `2` |
| Embedding concurrency | `3` |
| File timeout | `600000` ms |

These values are historical evidence, not live production configuration. See
the current runbook for code defaults, tracked template values, and the rule
that live values remain private.

## Reported Outcome

The April record reported:

- files becoming workspace-visible in roughly 30–60 seconds;
- final indexing taking roughly 3–5 minutes for the measured workload;
- improved behavior from staged concurrency and two-phase status;
- GPU extraction capacity remaining the primary bottleneck.

Those were point-in-time observations from the retired stack. They are not
current service-level objectives and should not be quoted without a new
benchmark on the present worker, Qdrant, storage, and extraction path.

## Superseded Deployment Context

At the time, the worker ran on ECS/Fargate with CloudWatch monitoring and an
AWS-hosted Marker path. That application stack has since been retired.

Current boundaries:

- app and worker containers are deployed by Jenkins;
- Redis/BullMQ is the current homelab queue provider;
- Qdrant stores active vector embeddings;
- Marker is optional and externally configured;
- current container swap and rollback behavior is documented in
  [the homelab guide](../../infra/HOMELAB.md).

Do not restore the old ECS autoscaling resources, CloudWatch queries, region
settings, or rollback commands from Git history.

## Historical Implementation Areas

The work touched the import worker, extraction/embedding path, status route,
client polling, retry utilities, and tests. Several filenames and module
boundaries have changed since the record was written; current source is
authoritative.

Related context:

- [Current import worker runbook](../operations/import-worker.md)
- [Current homelab runtime](../../infra/HOMELAB.md)
- [Current import pipeline overview](../engineering/import-pipeline.md)

This file exists to explain why the concurrency and two-phase patterns were
introduced, not to direct a deployment.
