# OghmaNotes

Learning platform for students to write notes, search intelligently, and ask questions backed by their own materials.

## Status

**Foundation:** Complete (Auth, notes, PDFs, UUID v7)  
**Phase 1 (Search):** In progress (Issues #21-25)  
**Phase 2 (RAG):** Planned  
**Phase 3 (Features):** Planned

See [PROGRESS.md](PROGRESS.md) for detailed tracking.

## Getting Started

```bash
npm install
cp .env.example .env.local
docker-compose up
npm run dev
```

See [SETUP.md](SETUP.md) for detailed instructions.

## What's Built

**Working:**
- Auth (register, login, password reset)
- Markdown notes with offline support (PWA)
- PDF upload and annotation
- File organization (folders, tree structure)

**Phase 1 (Search):**
- Fuzzy + semantic search (Cmd+K overlay)
- Tree sorting and filtering

**Phase 2 (RAG):**
- RAG chat with citations
- PDF text extraction and chunking

**Phase 3 (Features):**
- Quiz generation and flashcards
- Canvas LMS integration
- Calendar/analytics dashboard

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Backend:** Next.js API routes
- **Database:** PostgreSQL 12+ with pgvector
- **Storage:** AWS S3
- **Email:** AWS SES
- **Deploy:** AWS Amplify

## Search

Cmd+K opens search overlay. Supports:
- Fuzzy search (filename + content)
- Semantic search (vector similarity)
- Tree sorting (alphabetical, recent)

See [SEARCH_ARCHITECTURE_PLAN.md](SEARCH_ARCHITECTURE_PLAN.md) for implementation details.

## LLM Integration

Users provide their own API keys (OpenAI, Anthropic, etc.) — no backend key management.

See [docs/LLM_STRATEGY.md](docs/LLM_STRATEGY.md) for details.

## Documentation

- **[PROGRESS.md](PROGRESS.md)** — Project progress and tracking
- **[SETUP.md](SETUP.md)** — Development and deployment setup
- **[docs/SRS.tex](docs/SRS.tex)** — Formal specification (v2.1)
- **[SEARCH_ARCHITECTURE_PLAN.md](SEARCH_ARCHITECTURE_PLAN.md)** — Phase 1 detailed spec
- **[docs/LLM_STRATEGY.md](docs/LLM_STRATEGY.md)** — LLM integration approach

## GitHub Project

- **[Project Board](https://github.com/users/semyonfox/projects/5)** — Live issue tracking
- 20 items (3 foundation, 5 Phase 1, 5 Phase 2, 5 Phase 3)

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh

## License

MIT
