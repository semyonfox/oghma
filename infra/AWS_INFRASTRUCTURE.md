# infrastructure

> **current status (2026-05-02):** migrated to homelab. AWS Amplify + RDS decommissioned.
> see [MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md) for the cutover procedure.
> target monthly AWS cost after migration: ~$0.50 (Route 53 only).

---

# AWS infrastructure

Region: **eu-west-1** (Ireland)  
Account: **877013879182** (amazon@oghmanotes.ie)  
AWS CLI profile: `default`

---

## accounts

| profile | account | purpose |
|---|---|---|
| `default` | 877013879182 | active — oghmanotes.ie |
| `old-oghma` | 723920043097 | decommissioned — all resources deleted |
| `personal` | 949642303254 | personal AWS account |

---

## VPC

**VPC:** `vpc-09e956f141cb8d460`  
**Internet Gateway:** `igw-041007c1ce3dc11e4`

| subnet | name | CIDR | AZ | public |
|---|---|---|---|---|
| subnet-009c3cb81060eed66 | oghma-public-1a | 10.0.1.0/24 | eu-west-1a | yes |
| subnet-045d34e467e5725d5 | oghma-public-1b | 10.0.2.0/24 | eu-west-1b | yes |
| subnet-00c737efb6ea3dde2 | oghma-private-1a | 10.0.10.0/24 | eu-west-1a | no |
| subnet-0b1a6fae742d7c2c5 | oghma-private-1b | 10.0.11.0/24 | eu-west-1b | no |

**Route tables:**
- `oghma-public-rt`: 0.0.0.0/0 → IGW
- `oghma-private-rt`: 0.0.0.0/0 → NAT Gateway (`nat-0e3871a54c51c6f4e`)

**NAT Gateway:** `nat-0e3871a54c51c6f4e` — created 2026-04-15, in oghma-public-1a.  
EIP: `eipalloc-02f4d1c337fda92a2` / 52.17.67.157 (tagged `oghma-nat-eip`).  
> ⚠ costs ~$35/month. nothing actually routes through it — candidate for deletion.

**Elastic IPs:**
- `eipalloc-02f4d1c337fda92a2` — 52.17.67.157 — NAT gateway
- `eipalloc-00ea035fa6fbfd822` — 54.72.36.32 — RDS network interface (public-1a)

---

## compute

### Amplify — `d3nmhn9o8j3uf3`

Platform: **WEB_COMPUTE** (Next.js SSR, serverless lambdas)  
No VPC config — connects to RDS over the public internet.

| branch | URL |
|---|---|
| main | https://oghmanotes.ie (production) |
| dev | https://dev.oghmanotes.ie |

Build: `amplify.yml` — runs `npm run migrate` (prebuild, using `oghmanotes/migrator` secret) then `npm run build`.  
Runtime env vars are unset before build to prevent SSR prerender crashes; written to `.env.production` for runtime only.

### chat Lambda

Function URL: `ucgh56r224mtkven646qi4tf6u0vnkcf.lambda-url.eu-west-1.on.aws`  
Source: `infra/chat-lambda/`. Deployed separately via `infra/chat-lambda/deploy.sh`.

### ECS cluster — `oghmanotes`

Service: `canvas-import-worker` — FARGATE, **0 desired / 0 running** (paused).  
Worker image built via CI and pushed to ECR. No task definitions currently registered.

### Auto Scaling Group — `marker-asg-oghmanotes`

GPU worker for PDF extraction via Marker OCR.  
Instance type: g4dn.xlarge (NVIDIA T4). **min=0, max=0, desired=0** — scaled to zero.  
Setup scripts in `infra/marker/`. AMI baked via `bake-ami.sh`.  
App scales this ASG up/down via `MARKER_ASG_NAME` / `MARKER_ASG_REGION` env vars.

---

## database

### RDS — `oghma`

| field | value |
|---|---|
| engine | PostgreSQL 17 |
| class | db.t3.micro |
| storage | 20 GB GP3 |
| multi-AZ | no |
| publicly accessible | yes |
| subnet group | oghma-db-public (public subnets) |
| security group | sg-0dbe1bbc3081b92ca |
| backup retention | 7 days |
| created | 2026-04-16 |

**Endpoint:** `oghma.c9sac6iec8m8.eu-west-1.rds.amazonaws.com:5432`  
**DB / schema / user:** `oghma` / `app` / `oghma_app`  
Migration user (`oghma_admin` role) credentials are in `oghmanotes/migrator` secret.  
Migrations live in `database/migrations/` — applied automatically on deploy.  
Tracking table: `app.schema_migrations` (migrations 001–017 are legacy bootstrapped; new ones start from 018+).

> ⚠ db.t3.micro does not qualify for the RDS free tier in eu-west-1 (free tier covers db.t2.micro only, which is unavailable for PostgreSQL in this region). Costs ~$17/month.

### ElastiCache — `oghma-valkey-001`

Valkey 8.2, cache.t3.micro. Subnet group `oghma-cache-subnets` (private subnets only).  
> ⚠ **orphaned** — no `REDIS_URL` in any Amplify env var; nothing connects to it. Costs ~$11/month. Candidate for deletion.

---

## queues

Both on SQS free tier (1M requests/month, always free):

| queue | purpose |
|---|---|
| `oghmanotes-canvas-import` | jobs sent by API, consumed by canvas-import-worker ECS task |
| `oghmanotes-extract-retry` | dead-letter / retry queue for failed extractions |

---

## storage

**S3 bucket:** `oghma-notes-store-877013879182` (eu-west-1)  
Accessed via IAM user `AKIA4YMQZZGHMJZZIJOC` (key in `STORAGE_ACCESS_KEY` env var).  
Prefix: `oghma`.

**ECR:** oghmanotes registry. Free tier is 500 MB/month — needs periodic image cleanup to stay under.

---

## secrets & config

### Secrets Manager

| secret | last accessed | purpose |
|---|---|---|
| `oghmanotes/database` | 2026-04-29 | DB credentials for runtime |
| `oghmanotes/app-secrets` | 2026-04-21 | misc app secrets |
| `oghmanotes/migrator` | 2026-04-21 | `oghma_admin` DB credentials, pulled at build time only |

Referenced via `SECRETS_ID` env var (`oghmanotes/database;oghmanotes/app-secrets`).  
Cost: ~$0.40/secret/month. Migration target: SSM Parameter Store (standard params are free).

### key env vars

```
DATABASE_URL          postgresql://oghma_app:...@<rds-endpoint>:5432/oghma?sslmode=require&search_path=app
NEXTAUTH_URL          https://oghmanotes.ie
NEXT_PUBLIC_CHAT_URL  <chat lambda function URL>
MARKER_ASG_NAME       marker-asg-oghmanotes
MARKER_ASG_REGION     eu-west-1
SQS_QUEUE_URL         https://sqs.eu-west-1.amazonaws.com/877013879182/oghmanotes-canvas-import
SQS_EXTRACT_RETRY_QUEUE_URL  https://sqs.eu-west-1.amazonaws.com/877013879182/oghmanotes-extract-retry
STORAGE_BUCKET        oghma-notes-store-877013879182
SES_FROM_EMAIL        noreply@oghmanotes.ie
SES_REGION            eu-west-1
```

---

## email

**SES:** noreply@oghmanotes.ie, eu-west-1.  
IAM user `AKIA4YMQZZGHE3A7PQFZ` (key in `SES_ACCESS_KEY_ID` env var).  
Free tier: 3,000 messages/month (always free).

---

## DNS

**Route 53:** oghmanotes.ie hosted zone — $0.50/month.

---

## external services

| env var | provider | purpose |
|---|---|---|
| `LLM_API_KEY` / `LLM_API_URL` | Moonshot AI (api.moonshot.ai) | LLM — kimi-k2.5 |
| `EMBEDDING_API_KEY` / `EMBEDDING_API_URL` | OpenRouter (openrouter.ai) | embeddings — qwen/qwen3-embedding-8b (4096d) |
| `RERANK_API_KEY` / `RERANK_API_URL` | SiliconFlow (api.siliconflow.com) | reranker — Qwen/Qwen3-Reranker-8B |
| `COHERE_API_KEY` | Cohere | embeddings / reranking (legacy) |
| `DATALAB_API_KEY` | Datalab | PDF extraction (Marker API) |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth | NextAuth provider |
| `GOOGLE_ID` / `GOOGLE_SECRET` | Google OAuth | NextAuth provider |
| `WEB3FORMS_ACCESS_KEY` | Web3Forms | contact form submissions |

---

## auth

NextAuth.js with:
- GitHub OAuth (Ov23liTeltYW311010bx)
- Google OAuth (client 218744513989-...)
- Credentials (email/password) — `ENABLE_CREDENTIALS_AUTH=true`

---

## billing (as of 2026-05)

No AWS credits on the account.

| service | april 2026 | est. monthly | notes |
|---|---|---|---|
| NAT Gateway (data + VPC) | ~$21.55 | ~$35 | nothing needs it — delete |
| RDS db.t3.micro | $8.69 | ~$17 | t3.micro not free tier in eu-west-1 |
| ElastiCache cache.t3.micro | $5.27 | ~$11 | orphaned — delete |
| Amplify WEB_COMPUTE | $4.72 | ~$5 | beyond free tier compute |
| Route 53 | $0.50 | $0.50 | unavoidable |
| Secrets Manager | $0.60 | $0.60 | migrate to SSM |
| ECR | $0.34 | ~$0.30 | clean images to stay under 500MB |
| Tax (Irish VAT 23%) | $9.64 | — | |
| **total** | **~$51** | **~$70** | |

### free-tier migration todo

1. delete ElastiCache `oghma-valkey-001` (orphaned, saves ~$11/mo)
2. delete NAT Gateway `nat-0e3871a54c51c6f4e` + release NAT EIP (saves ~$35/mo)
3. RDS: db.t2.micro unavailable for PostgreSQL in eu-west-1 — investigate alternatives (Neon free tier, Supabase, or keep t3.micro at ~$17/mo)
4. migrate Secrets Manager → SSM Parameter Store free tier (saves ~$0.60/mo)
5. clean ECR images to stay under 500MB free tier

---

# homelab infrastructure

server: `10.0.0.5` (ssh semyon@server), Ubuntu 24.04, 30GB RAM, 457GB NVMe

## stack location

```
~/server-stacks/oghma/
  docker-compose.yml          postgres + cloudflared (run: docker compose up -d)
  .env                        POSTGRES_ADMIN_PASSWORD (generated by setup.sh)
  .env.prod                   prod runtime env vars
  .env.dev                    dev runtime env vars
  cloudflared-config.yml      tunnel ingress rules (fill in tunnel UUID)
  cloudflared-credentials.json  tunnel credentials (from CF dashboard)
  init-db.sql                 first-time DB init (extensions, oghma_app user)
  setup.sh                    first-time setup script

~/jenkins/env/
  oghma-prod.env              prod env (copy of .env.prod, used by Jenkins deploy)
  oghma-dev.env               dev env (copy of .env.dev, used by Jenkins deploy)
```

## services

| container | image | network | purpose |
|---|---|---|---|
| oghma-postgres | pgvector/pgvector:pg17 | oghma | PostgreSQL 17 + pgvector |
| oghma-prod | oghma:prod-<sha> | oghma | prod Next.js app |
| oghma-dev | oghma:dev-<sha> | oghma | dev Next.js app |
| oghma-cloudflared | cloudflare/cloudflared | oghma | CF tunnel → oghmanotes.ie + dev.oghmanotes.ie |

## CI/CD

Jenkins at https://jenkins.semyon.ie  
pipelines: `oghma-prod` (branch: main) and `oghma-dev` (branch: dev)  
trigger: GitHub webhook → `https://jenkins.semyon.ie/github-webhook/`

deploy flow:
1. `docker build` — Next.js standalone image
2. migrations — `docker run --rm` with `MIGRATION_DATABASE_URL` from env file
3. zero-downtime swap (prod) — start `oghma-prod-next`, wait healthy, stop/rename old
4. quick replace (dev) — stop old, start new

## useful commands

```bash
# status
docker ps --filter name=oghma

# logs
docker logs oghma-prod -f
docker logs oghma-cloudflared -f

# database shell
docker exec -it oghma-postgres psql -U oghma_admin oghma

# manual prod deploy (Jenkins normally handles this)
docker pull oghma:prod-latest
# or trigger Jenkins manually

# update stack (postgres / cloudflared)
cd ~/server-stacks/oghma && docker compose pull && docker compose up -d
```
