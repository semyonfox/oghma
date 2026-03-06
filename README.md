# 📚 OghmaNotes

**An AI-powered learning platform that combines portable Markdown notes with Retrieval-Augmented Generation (RAG) to help students learn smarter.**

> **Why "Oghma"?** Oghma (pronounced "OH-muh") is the Celtic deity of eloquence, learning, and writing from Irish mythology. A member of the Tuatha Dé Danann, Oghma created the Ogham script—the ancient Irish writing system—to preserve and transmit knowledge. He embodied both intellectual mastery and strength, serving as Champion while inventing systems for organizing language. This dual nature of knowledge preservation and capability reflects our platform's mission: to create structured learning systems that empower students through intelligent organization and retrieval of their study materials.

## What works

**Phase 1: Foundation + Search** ✅ Core complete, 🔄 Search planned
- ✅ Register with email/password + verification
- ✅ Login with JWT auth + session management
- ✅ PostgreSQL database with pgvector support
- ✅ Create, edit, organize notes in Markdown + offline support
- ✅ PDF upload, annotation, and highlighting
- ✅ File sync to AWS S3
- ✅ Responsive design (desktop + tablet)
- 🔄 **Fuzzy full-text search** (PostgreSQL FTS)
- 🔄 **Semantic search** (pgvector embeddings)
- 🔄 **Search UI** (Cmd+K overlay, keyboard-first)
- 🔄 **Tree sorting** (alphabetical, recent)

**Phase 2: RAG Pipeline** 🔄 In progress
- 🔄 RAG chat with citations (coming soon)
- 🔄 Semantic retrieval for RAG context
- 🔄 Streaming LLM responses (user-managed keys)

**Phase 3: Features** ⏳ Planned
- Quiz generation, flashcards (SM-2), LMS integration, analytics

## Tech stack

**Frontend & Backend**
- Next.js 16 (App Router, SSR/SSG)
- React 19 + TypeScript
- Tailwind CSS 4
- Lexical editor (rich text)
- Zustand (state management)

**Database & Storage**
- PostgreSQL 12+ with pgvector extension (vector embeddings, hybrid search)
- AWS S3 (PDFs, Markdown notes, exports)
- AWS ElastiCache (future: caching & job queues)

**Authentication & Email**
- bcryptjs (password hashing)
- JWT (stateless auth)
- Nodemailer + AWS SES (email)

**LLM & AI** (User-provided, flexible)
- **Embedding models:** Your choice (OpenAI, Hugging Face, local Qwen, etc.)
- **LLM providers:** LiteLLM or similar serverless gateway
- **User-managed keys:** Users provide their own API keys—no backend secret management
- **Cost-saving:** Team can use internal models (Qwen, embeddings server) for testing

## Getting Started

**Prerequisites:**
- Node.js 18+
- PostgreSQL 12+ with pgvector extension
- AWS S3 bucket (or MinIO for local dev)

**Local Setup:**
```bash
# 1. Clone and install
git clone <repo>
cd oghmanotes
npm install

# 2. Set up environment
cp .env.example .env.local

# 3. Configure AWS S3 credentials in .env.local
# Get credentials from AWS console, then set:
# STORAGE_ACCESS_KEY=...
# STORAGE_SECRET_KEY=...
# STORAGE_BUCKET=your-local-bucket

# 4. Start the database
docker-compose up

# 5. Run development server (in another terminal)
npm run dev
```

Open http://localhost:3000, register, and start creating notes.

**Full setup guide:** See [SETUP.md](SETUP.md) — includes Docker, manual setup, and AWS production deployment

## Project structure
```
src/
├── app/                     # Next.js App Router
│   ├── (auth)/             # Auth pages (login, register, reset)
│   ├── (app)/              # Main app (notes, editor, PDFs)
│   ├── api/                # API routes
│   └── layout.tsx          # Root layout + providers
├── lib/                    # Utilities & helpers
├── components/             # React components
└── styles/                 # Global CSS

database/
├── schema.sql              # PostgreSQL schema (with pgvector)
└── migrations/             # Future: version-controlled migrations

docs/
├── SRS_UPDATED.md          # Updated requirements specification
├── STACK_ANALYSIS.md       # Tech stack vs SRS comparison
├── ARCHITECTURE.md         # System design
└── *.md                    # Other documentation

public/                     # Static assets
docker-compose.yml          # Local development stack
```

## Key API Endpoints

**Authentication**
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT
- `POST /api/auth/logout` - Invalidate session
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Complete reset

**Notes & Files**
- `GET /api/notes` - List user's notes
- `POST /api/notes` - Create note
- `GET /api/notes/:id` - Get note content
- `PATCH /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `POST /api/upload` - Upload PDF / file

**RAG Pipeline** (coming soon)
- `POST /api/rag/chat` - Send question, get RAG response with citations
- `POST /api/rag/index` - Index PDF for search
- `GET /api/rag/search` - Hybrid search (keyword + semantic)

See OpenAPI spec for full documentation (coming soon).

## Commands
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm start                # Run production build
npm run lint             # Check code with ESLint
npm run db:migrate       # Run database migrations
npm run db:reset         # Reset database (dev only)
```

## Development Workflow

1. **Feature branch:** Create from `dev` branch
2. **Local testing:** `npm run dev` + manual testing
3. **Pull request:** Push to feature branch, create PR
4. **Code review:** Team reviews changes
5. **Merge to dev:** After approval
6. **Promote to prod:** Manual merge `dev` → `prod` (triggers Amplify auto-deploy)

## LLM Provider Setup (User-Managed Keys)

OghmaNotes supports flexible LLM provider selection. Users manage their own API keys—no backend secret storage required.

**Supported providers:**
- OpenAI (GPT-3.5, GPT-4, embeddings)
- Anthropic (Claude)
- Cohere
- Local models (Qwen, etc. via your server)
- Any provider supported by LiteLLM

**How it works:**
1. User goes to Settings → AI Provider
2. Selects provider (OpenAI, Anthropic, custom server, etc.)
3. Pastes their API key
4. Frontend stores key in browser localStorage (or secure session)
5. RAG requests sent with user's key → frontend makes request to LiteLLM/provider
6. No secrets on backend, no key management overhead

**For team testing:**
- Use internal Qwen embedding model on your server
- Use internal LLM for quiz/flashcard generation
- Zero cost during development

## Architecture

**MVP (Current - Monolithic)**
```
┌─────────────────────────────────────┐
│      Next.js 16 Full Stack          │
├─────────────────────────────────────┤
│  Frontend: React 19 + Tailwind      │
│  Backend:  API routes + auth        │
│  Workers:  TBD (may add later)      │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│    PostgreSQL + pgvector + S3       │
└─────────────────────────────────────┘
```

**Future (Microservices - if time permits)**
- Separate RAG pipeline service
- Dedicated worker/queue service (ElastiCache + BullMQ)
- API gateway for service coordination

**Deployment**
- Local: Docker Compose
- Production: AWS Amplify (auto-deploy from `prod` branch)
- Database: AWS RDS PostgreSQL
- Storage: AWS S3
- Cache: AWS ElastiCache

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines (coming soon).

## Documentation

- **[SRS.tex](docs/SRS.tex)** - Complete requirements spec (v2.1, living document)
- **[SEARCH_ARCHITECTURE_PLAN.md](SEARCH_ARCHITECTURE_PLAN.md)** - Phase 1: Search implementation roadmap
- **[LLM_STRATEGY.md](docs/LLM_STRATEGY.md)** - User-managed LLM keys architecture
- **[STACK_ANALYSIS.md](docs/STACK_ANALYSIS.md)** - Tech decisions & comparison with original SRS
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design & tech decisions
- **[SETUP.md](SETUP.md)** - Detailed local + production setup guide

## Team

- **Samuel Regan** - RAG pipeline & AI features
- **Semyon Fox** - Frontend & infrastructure
- **Shreyansh Singh** - Backend & database

## License

MIT (with attribution to Notea for UI scaffold)

