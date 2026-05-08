# infrastructure

> **current status (2026-05-05):** fully migrated to homelab. AWS now hosts only DNS (Route 53) and email (SES).
> see [HOMELAB.md](HOMELAB.md) for the running stack.

---

# AWS — what's left

| service | purpose | cost |
|---|---|---|
| Route 53 | `oghmanotes.ie` hosted zone | $0.50/mo |
| SES | `noreply@oghmanotes.ie` outbound (verification, password reset, contact form) | free tier (3k msgs/mo) |
| Lambda `ses-email-forwarder` | inbound SES → forward to Gmail | free tier |

Region: **eu-west-1**. Account: **877013879182**.

Everything else (Amplify, RDS, ECS, ASG, NAT Gateway, ElastiCache, Secrets Manager, S3 bucket, SQS, chat Lambda) was decommissioned during the homelab migration. See git history `chore: scrub sensitive content references` and the queue / chat / marker migration commits.

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
| outbound email (SES) | AWS, eu-west-1 | IAM user keys in env file |
| LLM / embedding / reranker | external SaaS | Moonshot / OpenRouter / SiliconFlow |

---

# external services

| env var | provider | purpose |
|---|---|---|
| `LLM_API_KEY` / `LLM_API_URL` | Moonshot AI | LLM — kimi-k2.5 |
| `EMBEDDING_API_KEY` / `EMBEDDING_API_URL` | SiliconFlow | embeddings — Qwen/Qwen3-Embedding-8B (4096d) |
| `RERANK_API_KEY` / `RERANK_API_URL` | OpenRouter | reranker — Qwen/Qwen3-Reranker-8B |
| `COHERE_API_KEY` | Cohere | legacy embeddings / reranking |
| `DATALAB_API_KEY` | Datalab | PDF extraction (Marker API, optional) |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth | NextAuth provider |
| `GOOGLE_ID` / `GOOGLE_SECRET` | Google OAuth | NextAuth provider |
| `WEB3FORMS_ACCESS_KEY` | Web3Forms | contact form submissions |

---

# auth

NextAuth.js with:
- GitHub OAuth
- Google OAuth
- Credentials (email/password) — `ENABLE_CREDENTIALS_AUTH=true`
