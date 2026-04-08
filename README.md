# OghmaNotes

A note-taking app built for the CT216 software engineering module.

Features:
- Markdown notes with a tree-based folder system
- User auth (register/login/password reset)
- PDF uploads to S3
- Soft delete (notes are recoverable for 7 days)
- JWT-based sessions
- Search / command palette (Cmd+K)
- AI chat with RAG (semantic search over your notes)
- Canvas LMS import (PDF extraction + embedding pipeline)
- Quiz generation with spaced repetition (FSRS)

Planned:
- Note export (markdown/PDF)
- OAuth providers (Google, GitHub)
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

- Next.js 16 (frontend + API routes)
- PostgreSQL with pgvector
- AWS S3 (file storage)
- Zustand (state)
- Lexical (rich text editor)
- Cohere (embeddings + reranking)
- Redis (rate limiting, caching)
- AWS SQS + ECS (async Canvas import worker)
- Marker OCR on GPU EC2 (PDF extraction)

## Setup

See [SETUP.md](SETUP.md).

## Credits

Based on Notea (MIT licensed).

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh