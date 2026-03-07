# OghmaNotes

Learning platform for students to write notes, search intelligently, and ask questions backed by their own materials.

## Status

**Foundation:** ✅ Complete (Auth, notes, UUID v7)  
**PDF Viewer:** 🚀 Shipping (View, zoom, OCR auto on upload)
**Phase 1 (Search):** 🔄 In progress (Fuzzy + semantic search)  
**Phase 2 (RAG):** 🎯 Next (Chat with PDFs, citations)  
**Phase 3 (Features):** ⏳ Planned (Quiz, flashcards, Canvas)

**Timeline:** 10-12 weeks for full v1 (includes PDF viewer + RAG + learning tools)

See [PROGRESS.md](PROGRESS.md) for detailed tracking.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Requires:
- Node.js 25+
- PostgreSQL 12+ (with pgvector extension)
- AWS account (S3, SES, RDS)
- `.env.local` configured with credentials

See [SETUP.md](SETUP.md) for detailed instructions.

## What's Built

**✅ Foundation (Complete):**
- Auth (register, login, password reset, email verification)
- Markdown notes with offline support (PWA)
- File organization (folders, tree structure, drag-and-drop)
- User settings and preferences
- PostgreSQL database with UUID v7 (100x faster queries)

**🚀 PDF Viewer (Shipping This Week):**
- PDF upload to AWS S3
- PDF viewing with zoom, page navigation, text selection
- **Auto OCR on upload** (text extraction automatic)
- **Auto embedding generation** (semantic search ready)
- PostgreSQL tree migration (fixes sync, 100x faster)
- Annotation infrastructure ready (drawing UI deferred)

**🔄 Phase 1 (Search):** In progress (2-3 weeks remaining)
- [ ] Fuzzy keyword search endpoint (`/api/search?type=fuzzy`)
- [ ] Semantic vector search endpoint (`/api/search?type=semantic`)
- [ ] Embedding generation endpoint (`/api/notes/:id/embed`)
- [ ] Cmd+K search overlay UI (component exists, not wired to API)

**🎯 Phase 2 (RAG):** Coming next (3-4 weeks after Phase 1)
- RAG chat endpoint with streaming responses
- Ask questions about PDFs and notes
- Source citations linking to PDFs
- Works with auto-extracted PDF text

**⏳ Phase 3 (Features):** Planned (4+ weeks after Phase 2)
- Quiz generation from notes/PDFs
- Flashcard system with SM-2 spaced repetition
- Canvas LMS integration (OAuth, assignment sync)
- Basic analytics (scores, mastery, study time)

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

- **[docs/SRS.tex](docs/SRS.tex)** — Formal specification (v3, updated March 2025)
- **[PROGRESS.md](PROGRESS.md)** — Project progress and tracking
- **[SETUP.md](SETUP.md)** — Development and deployment setup
- **[SEARCH_ARCHITECTURE_PLAN.md](SEARCH_ARCHITECTURE_PLAN.md)** — Phase 1 detailed implementation spec
- **[docs/LLM_STRATEGY.md](docs/LLM_STRATEGY.md)** — LLM integration approach
- **[ALIGNMENT_CHECK.md](ALIGNMENT_CHECK.md)** — SRS vs Code alignment audit (transparency)

## GitHub Project

- **[Project Board](https://github.com/users/semyonfox/projects/5)** — Live issue tracking
- 20 items (3 foundation, 5 Phase 1, 5 Phase 2, 5 Phase 3)

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh

## License

MIT
