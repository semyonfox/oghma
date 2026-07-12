# AWS-to-Homelab Migration Record

> Status: Completed historical record; not a runnable migration guide
>
> Audience: Maintainers researching how the current stack originated
>
> Completed: 2026

The old AWS application stack was replaced by the current homelab
Docker/Jenkins runtime. Current operations are in
[HOMELAB.md](HOMELAB.md); future direction is in
[TARGET_HOSTING.md](TARGET_HOSTING.md); any retained AWS surface is in
[AWS_INFRASTRUCTURE.md](AWS_INFRASTRUCTURE.md).

## Result

| Retired role | Replacement after migration |
|---|---|
| Amplify web compute | Jenkins-deployed Next.js containers |
| ECS/Fargate worker | Jenkins-deployed long-running Node worker containers |
| RDS PostgreSQL | Homelab PostgreSQL 17 |
| ElastiCache and SQS | Redis/BullMQ, behind the queue facade |
| S3 application storage | RustFS S3-compatible storage |
| pgvector production search | Qdrant, added after the initial migration |
| Secrets Manager runtime injection | Private Jenkins env files |
| AWS ingress/DNS application path | nginx and Cloudflare tunnels |

AWS ceased to be the application host. Route 53 or SES resources may remain
only as explicitly verified retained/fallback services.

## Migration Pattern Used

The migration followed a low-downtime replacement pattern:

1. build persistent homelab services alongside the AWS stack;
2. deploy development and production app/worker containers through Jenkins;
3. restore relational data and object storage;
4. verify app, worker, database, queue, and storage behavior;
5. move public routing after health checks;
6. preserve DNS rollback while both environments were available;
7. decommission the old application services after an observation period.

This sequence is retained as architectural context only. The original resource
names, regions, credentials, commands, backups, and rollback targets are no
longer assumed to exist.

## Lessons Carried Forward

- Separate persistent stateful services from replaceable app/worker images.
- Run migrations as an explicit deployment stage with a dedicated credential.
- Verify a candidate container before replacing the fixed runtime.
- Keep app and worker configuration aligned.
- Preserve object keys and database references during storage moves.
- Test restore, not only backup creation.
- Change one stateful boundary at a time.
- Remove historical commands once their rollback target is gone.

## Historical Boundary

Do not use this file to:

- deploy current app or worker containers;
- modify AWS resources;
- restore an old database dump;
- change DNS;
- infer current credentials or provider inventory;
- plan a future hosting migration.

Use [the infrastructure index](README.md) to select the active document.
