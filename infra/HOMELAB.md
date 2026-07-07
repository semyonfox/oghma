# homelab stack

server: `10.0.0.5` (ssh semyon@server), Ubuntu 24.04, 30 GB RAM, 457 GB NVMe, GTX 1050 4 GB.

## stack location

```
~/server-stacks/oghma/
  docker-compose.yml          postgres + redis + rustfs + nginx + cloudflared (run: docker compose up -d)
  .env                        POSTGRES_ADMIN_PASSWORD, RUSTFS_*, CLOUDFLARED_*_TUNNEL_TOKEN
  init-db.sql                 first-time DB init (extensions, oghma_app user)
  cloudflared-config.yml      tunnel ingress rules
  nginx/                      nginx config (oghmanotes.ie + dev.oghmanotes.ie → app containers)

~/jenkins/env/
  oghma-prod.env              prod runtime env (read by app + worker containers)
  oghma-dev.env               dev runtime env
```

## services

| container | image | purpose |
|---|---|---|
| oghma-postgres | pgvector/pgvector:pg17 | PostgreSQL 17 + pgvector |
| oghma-redis | redis:7-alpine | BullMQ + cache + rate-limit (AOF on, 1 GB cap, noeviction — BullMQ requires noeviction; verified live 2026-07-07) |
| oghma-rustfs | rustfs/rustfs:latest | S3-compatible object store |
| oghma-qdrant | qdrant/qdrant:latest | vector store for chunk embeddings (per-env collections `oghma_{env}_chunks`), ensured by the Jenkins vector-store stage |
| oghma-nginx | nginx:alpine | TLS termination handed off to CF tunnels; routes prod / dev |
| oghma-cloudflared-prod | cloudflare/cloudflared | tunnel for `oghmanotes.ie` |
| oghma-cloudflared-dev | cloudflare/cloudflared | tunnel for `dev.oghmanotes.ie` |
| oghma-prod / oghma-dev | oghma:{env}-{sha} | Next.js app — managed by Jenkins |
| oghma-prod-worker / oghma-dev-worker | oghma-worker:{env}-{sha} | BullMQ worker — managed by Jenkins |

## accepted risks

- prod and dev share the same postgres / redis / rustfs instances (separated by database, queue prefix, and bucket/collection naming). a dev migration bug or runaway dev worker can degrade prod. accepted for the closed beta on this interim stack; expires at first paying user — the phase 5 launch target gives each env isolated stateful services.

## CI/CD

Jenkins at https://jenkins.semyon.ie  
pipelines: `oghma-prod` (branch: main) and `oghma-dev` (branch: dev).  
trigger: GitHub webhook → `https://jenkins.semyon.ie/github-webhook/`.

deploy flow per pipeline:
1. `docker build` — app image (Dockerfile) + worker image (Dockerfile.worker) in parallel
2. migrations — `docker run --rm` against `MIGRATION_DATABASE_URL` from env file
3. zero-downtime swap (prod) — start `oghma-prod-next`, wait healthy, stop/rename old
   quick replace (dev) — stop old, start new
4. swap worker — `oghma-{env}-worker` is replaced (in-flight jobs reclaimed via DB safety-net)
5. cleanup — keep last 3 tagged images per repo per env

## queues

BullMQ on Redis (`oghma-redis:6379`):

| queue | job names |
|---|---|
| `canvas-import` | canvas-discover, canvas-file, canvas-import (legacy), extract, marker-complete, vault-export, vault-import |
| `extract-retry` | extract-retry (delayed) |

producers: every API route that previously sent to SQS now calls `enqueueCanvasJob` from `src/lib/queue.ts`.  
consumer: `src/lib/canvas/worker-entry.js` runs in `oghma-{env}-worker` containers.

## useful commands

```bash
# status
docker ps --filter name=oghma

# logs
docker logs oghma-prod -f
docker logs oghma-prod-worker -f
docker logs oghma-cloudflared-prod -f

# database shell
docker exec -it oghma-postgres psql -U oghma_admin oghma

# redis shell
docker exec -it oghma-redis redis-cli

# update stack (postgres / redis / rustfs / nginx / cloudflared)
cd ~/server-stacks/oghma && docker compose pull && docker compose up -d
```
