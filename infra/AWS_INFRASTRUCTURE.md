# AWS Infrastructure Archive

> **status:** historical/fallback reference. The old AWS application stack was migrated to homelab. The launch target is now Cloudflare + Neon + R2 + a small Node runtime where needed, documented in [TARGET_HOSTING.md](TARGET_HOSTING.md).
> See [HOMELAB.md](HOMELAB.md) for the running interim stack.

---

# AWS — retained or fallback surface

| service | purpose | cost |
|---|---|---|
| Route 53 | Historical DNS or emergency fallback only; Cloudflare DNS is the launch target | $0.50/mo if retained |
| SES | Historical/fallback transactional email path | usage-based |
| Lambda `ses-email-forwarder` | Historical inbound SES forwarding path | free tier-scale |

Region: **eu-west-1**. Account: **877013879182**.

Everything else (Amplify, RDS, ECS, ASG, NAT Gateway, ElastiCache, Secrets Manager, S3 bucket, SQS, chat Lambda) was decommissioned during the homelab migration. Cloudflare Email Sending is now the launch target for app mail, so SES is a fallback rather than the preferred path.

---

# what runs where now

| component | location | how |
|---|---|---|
| Next.js app (prod + dev) | homelab `oghma-prod`, `oghma-dev` | docker, Jenkins-deployed |
| BullMQ worker | homelab `oghma-{prod,dev}-worker` | docker, Jenkins-deployed |
| PostgreSQL 17 + pgvector | homelab `oghma-postgres` | docker, compose |
| Redis (BullMQ + cache + rate-limit) | homelab `oghma-redis` | docker, compose |
| Object storage (S3-compatible) | homelab `oghma-rustfs` | docker, compose |
| nginx + Cloudflare tunnels | homelab `oghma-nginx`, `oghma-cloudflared-{prod,dev}` | docker, compose |
| chat streaming | `/api/chat` in the Next.js app | direct SSE — no 30s timeout on homelab |
| document OCR (Marker) | optional — set `MARKER_API_URL` to enable, otherwise falls through to pdf-parse | — |
| outbound email | Cloudflare Email Service REST API | configured by `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, and `EMAIL_FROM` |
| LLM / embedding / reranker | external SaaS | configured by `LLM_*`, `EMBEDDING_*`, and `RERANK_*` env vars |

---

# external services

| env var | provider | purpose |
|---|---|---|
| `LLM_API_KEY` / `LLM_API_URL` | configured provider | LLM |
| `EMBEDDING_API_KEY` / `EMBEDDING_API_URL` | configured provider | embeddings |
| `RERANK_API_KEY` / `RERANK_API_URL` | configured provider | reranker |
| `COHERE_API_KEY` | Cohere | legacy embeddings / reranking |
| `DATALAB_API_KEY` | Datalab | historical/emergency PDF extraction fallback, not steady-state launch path |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth | NextAuth provider |
| `GOOGLE_ID` / `GOOGLE_SECRET` | Google OAuth | NextAuth provider |
| `WEB3FORMS_ACCESS_KEY` | Web3Forms | contact form submissions |

---

# auth

NextAuth.js with:
- GitHub OAuth
- Google OAuth
- Credentials (email/password) — `ENABLE_CREDENTIALS_AUTH=true`
