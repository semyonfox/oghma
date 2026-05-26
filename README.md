# OghmaNotes

A note-taking app built for the CT216 software engineering module.

Features:
- Markdown notes with a tree-based folder system
- User auth (register/login/password reset) + Google/GitHub OAuth
- PDF uploads to S3
- Soft delete (notes are recoverable for 7 days)
- Search / command palette (Cmd+K)
- AI chat with RAG (semantic search over your notes)
- Canvas LMS import (PDF extraction + embedding pipeline)
- Quiz generation with spaced repetition (FSRS)

Planned:
- Note export (markdown/PDF)
- Payments (Standard/Premium tiers)

## Quick start

```bash
npm install
cp .env.example .env.local
# fill in S3 credentials in .env.local
docker-compose up
npm run dev
```

Visit `http://localhost:3000`.

## Tech stack

- Next.js (frontend + API routes, runs in Docker on the homelab via Cloudflare Tunnel)
- PostgreSQL 17 with pgvector
- rustfs (S3-compatible object store)
- BullMQ on Redis (canvas-import + extract-retry queues; worker is a sibling container)
- Zustand (state)
- Lexical (rich text editor)
- SiliconFlow — Qwen3-Embedding-8B (embeddings, 4096d)
- OpenRouter — Qwen3-Reranker-8B (reranking)
- Moonshot AI — Kimi K2.5 (LLM)
- AWS SES — outbound email (verification, reset, contact form)

The live app runs on the homelab Docker stack behind Cloudflare tunnels. See [infra/HOMELAB.md](infra/HOMELAB.md) for the running stack and [infra/AWS_INFRASTRUCTURE.md](infra/AWS_INFRASTRUCTURE.md) for what's left on AWS.

## Setup

See [SETUP.md](SETUP.md).

## Credits

Based on Notea (MIT licensed).

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh
