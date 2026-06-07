# OghmaNotes

OghmaNotes is a study workspace for notes, Canvas LMS imports, semantic search, RAG chat, quizzes, flashcards, and planning.

## Current Features

- Tree-based notes and folders with rich-text / markdown editing
- File uploads and viewers for PDFs, images, and media
- RAG chat and semantic search over indexed notes
- Canvas LMS import with background extraction and embedding jobs
- Quiz and spaced-repetition study flows using FSRS
- Assignment planning, time blocks, and Pomodoro tracking
- Vault import/export for Markdown/Obsidian-style archives
- Credentials auth plus Google/GitHub OAuth support

## Quick Start

```bash
npm install
cp .env.example .env.local
docker-compose up
npm run dev
```

The local app runs at `http://localhost:3000`. See [SETUP.md](SETUP.md) for required environment variables and common commands.

## Stack

- Next.js app router for UI and API routes
- PostgreSQL 17 with pgvector
- RustFS or S3-compatible object storage
- Redis + BullMQ for Canvas, extraction, vault import, and vault export jobs
- Lexical, CodeMirror, Zustand, and Tailwind for the app UI
- Configurable LLM, embedding, rerank, and OCR providers
- AWS SES for outbound email; Route 53 for DNS

Production and dev currently run on the homelab Docker/Jenkins stack behind Cloudflare tunnels. Current operations live in [infra/HOMELAB.md](infra/HOMELAB.md); AWS is limited to DNS/email unless explicitly reintroduced in [infra/AWS_INFRASTRUCTURE.md](infra/AWS_INFRASTRUCTURE.md).

## Documentation

Start with [docs/README.md](docs/README.md) for the canonical docs map. Product planning is in [docs/ROADMAP.md](docs/ROADMAP.md), launch readiness is in [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md), and pricing/cost planning is in [docs/PRICING.md](docs/PRICING.md).

## Credits

Based on Notea (MIT licensed).

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh
