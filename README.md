# OghmaNotes

AI-powered learning platform combining Markdown notes with RAG-powered search and retrieval.

## Getting Started

```bash
npm install
cp .env.example .env.local
docker-compose up
npm run dev
```

See [SETUP.md](SETUP.md) for detailed instructions.

## What's Built

- Auth (register, login, password reset)
- Markdown notes with offline support (PWA)
- PDF upload and annotation
- File organization (folders, tree structure)
- Fuzzy + semantic search (Phase 1)
- RAG chat with citations (Phase 2)

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

## Requirements (SRS)

See [docs/SRS.tex](docs/SRS.tex) for formal specification.

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh

## License

MIT
