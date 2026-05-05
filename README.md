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
- Payments (Student/Pro tiers)

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

- Next.js (frontend + API routes, deployed on AWS Amplify WEB_COMPUTE)
- PostgreSQL 17 with pgvector (RDS, eu-west-1)
- AWS S3 (file storage)
- AWS SQS + ECS Fargate (async Canvas import worker)
- EC2 ASG g4dn.xlarge / NVIDIA T4 (Marker OCR, GPU PDF extraction)
- Zustand (state)
- Lexical (rich text editor)
- OpenRouter — qwen/qwen3-embedding-8b (embeddings, 4096d)
- SiliconFlow — Qwen3-Reranker-8B (reranking)
- Moonshot AI — Kimi K2.5 (LLM)

See [infra/AWS_INFRASTRUCTURE.md](infra/AWS_INFRASTRUCTURE.md) for full AWS architecture.

## Setup

See [SETUP.md](SETUP.md).

## Credits

Based on Notea (MIT licensed).

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh