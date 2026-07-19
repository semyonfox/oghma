# Retained AWS Surface

> Status: Retained/fallback inventory only; AWS is not the application host
>
> Audience: Operators reviewing legacy provider dependencies
>
> Last reviewed: 2026-07-11

The OghmaNotes app, worker, database, queue, vector store, and object storage do
not currently run on AWS. The running stack is documented in
[HOMELAB.md](HOMELAB.md).

Repository policy permits retaining Route 53, SES, and explicitly documented
external services. This document does not assert that a retained resource is
active; verify provider state and the private inventory before changing or
deleting anything.

## Possible Retained Services

| Service | Current boundary |
|---|---|
| Route 53 | Historical DNS or emergency fallback. Cloudflare is the current edge/DNS direction. |
| SES | Historical transactional-email fallback. Current application code sends with Cloudflare Email Sending and cannot switch to SES without an intentional implementation/configuration change. |
| SES forwarding Lambda | Historical inbound-mail artifact, if still retained. It is not part of the app runtime. |

No live credentials, account identifiers, resource ARNs, or deletion commands
belong in this repository document.

## Retired Application Stack

The former Amplify, RDS, ECS/Fargate, autoscaling/Marker, ElastiCache, SQS,
Secrets Manager, S3 application bucket, NAT, and chat Lambda architecture was
retired during the homelab migration. The completed migration is summarized in
[MIGRATION_RECORD.md](MIGRATION_RECORD.md).

Historical scripts or Git history do not prove that a resource still exists
and must not be used as a teardown checklist.

## Reintroduction Rule

Before adding an AWS runtime dependency:

1. document the requirement and why the current target cannot meet it;
2. retrieve current AWS documentation and pricing for the intended region;
3. define least-privileged IAM and secret ownership;
4. define observability, backup, restore, and rollback;
5. update [TARGET_HOSTING.md](TARGET_HOSTING.md), the relevant operations
   runbook, and private inventory in the same change;
6. test in development before production.

Do not resurrect the retired topology by default.
