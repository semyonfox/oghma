# RAG Development Quickstart

**For:** Friends starting RAG (embeddings, vector search, chat backend)  
**Status:** UI is done ✅ | Backend ready to build 🚀

---

## 1. Clone & Setup (5 minutes)

```bash
# Clone the repo
git clone git@github.com:semyonfox/oghma.git
cd oghma

# Install dependencies (use pnpm, NOT npm)
pnpm install

# Copy environment file
cp .env.example .env.local

# Start dev server
pnpm dev
```

**Then visit:** `http://localhost:3000/notes`

---

## 2. What You're Building

**RAG = Retrieval-Augmented Generation**

When a user types in the Chat tab:
1. **User asks question** → Chat API receives it
2. **Search context** → Find relevant notes using vector search (pgvector)
3. **Add context** → Include matching notes as system context
4. **Call LLM** → Send message + context to OpenAI/Anthropic
5. **Stream response** → Return answer to user

**Your job:** Build steps 2-5 (plus database + embeddings)

---

## 3. Key Files You'll Need

**Frontend (already done):**
- `src/components/panels/chat-tab.tsx` - Chat UI (sends messages, displays responses)
- `src/app/notes/page.tsx` - Main app page

**Backend (you build these):**
- `src/app/api/ai/chat/route.ts` - ⬅️ Chat API (streaming)
- `src/app/api/ai/embeddings/route.ts` - ⬅️ Embedding generation
- `src/lib/ai/` - ⬅️ AI utilities (LLM routing, embeddings)
- `src/lib/db/pgvector.ts` - ⬅️ Vector search queries

**Database:**
- `prisma/schema.prisma` - ⬅️ Database models (you create this)
- `prisma/migrations/` - ⬅️ Database migrations

---

## 4. Tech Stack for RAG

- **LLM Provider:** Vercel AI SDK (handles OpenAI + Anthropic)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Vector DB:** PostgreSQL + pgvector (NOT MariaDB)
- **ORM:** Prisma (for schema + migrations)
- **Raw SQL:** For pgvector queries (not fully supported by Prisma yet)

---

## 5. Outstanding Decisions (You Decide!)

Before coding, confirm with the team:

| Decision | Option A | Option B | Recommendation |
|---|---|---|---|
| **Embedding timing** | Sync (block save) | Async (background) | Async (better UX) |
| **API key management** | User-provided (BYOK) | Backend manages | BYOK (cheaper) |
| **Slide format** | Markdown | PowerPoint XML | Markdown (simpler) |
| **Sharing feature** | Include in MVP | Post-MVP | Post-MVP (less work) |
| **Backfill embeddings** | No backfill | Yes (fast or slow) | No backfill for MVP |
| **Error handling** | Graceful (chat works) | Loud (chat fails) | Graceful (better UX) |

---

## 6. Week-by-Week Plan

### Week 1: Database + Auth
- [ ] Create PostgreSQL RDS instance (AWS)
- [ ] Install pgvector extension
- [ ] Create Prisma schema (8 tables)
- [ ] Deploy migrations
- [ ] Set up Auth.js v5 (friend's responsibility if doing auth)

### Week 2: File Loading + S3
- [ ] Refactor upload API for user isolation
- [ ] Wire file tree to PostgreSQL
- [ ] Test Ctrl+S save flow
- [ ] Multi-user isolation tests

### Week 3: AI Integration
- [ ] Create `/api/ai/chat` endpoint (streaming)
- [ ] Implement BYOK (user stores own API keys)
- [ ] Create `/api/ai/embeddings` endpoint
- [ ] Wire Chat tab to backend

### Week 4: RAG Integration
- [ ] Implement embeddings generation (async)
- [ ] Create pgvector search query
- [ ] Wire RAG context to chat
- [ ] Performance optimization

### Week 5: Deployment & Testing
- [ ] Production environment setup
- [ ] Database migrations to prod
- [ ] Full end-to-end testing
- [ ] Monitoring + alerts

---

## 7. Running the App

```bash
# Development server (port 3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

---

## 8. Git Workflow

```bash
# Pull latest
git pull origin main

# Create feature branch
git checkout -b feature/rag-embeddings

# Make changes, test locally, then:
git add .
git commit -m "feat: implement embeddings generation"

# Push
git push origin feature/rag-embeddings

# Open PR on GitHub (let others review)
```

**Note:** We're all working on `main` for now. If conflicts happen, coordinate with the team.

---

## 9. Current Frontend Status

**What's working:**
- ✅ VSCode-style 3-pane layout (icon nav | file tree | editor | right panel)
- ✅ Split-pane editor (edit 2 files side-by-side)
- ✅ File tree with search, rename, delete, duplicate
- ✅ Markdown editor (edit/preview toggle)
- ✅ PDF, image, video viewers
- ✅ Chat tab UI (ready to receive messages from backend)
- ✅ Keyboard shortcuts: Ctrl+S, Tab, Escape

**What needs backend:**
- ⏳ Chat API integration
- ⏳ User notes loading from PostgreSQL
- ⏳ Embedding generation on save
- ⏳ Vector search for RAG context

---

## 10. Environment Variables

Create `.env.local` with:

```bash
# AWS S3 (existing, don't change)
STORAGE_BUCKET=our-chum-bucket
STORAGE_ACCESS_KEY=xxx
STORAGE_SECRET_KEY=xxx
STORAGE_REGION=eu-north-1

# PostgreSQL (you'll add)
DATABASE_URL=postgresql://user:pass@host:5432/oghma

# LLM API Keys (user-provided)
OPENAI_API_KEY=sk-xxx...
ANTHROPIC_API_KEY=sk-ant-xxx...

# Auth.js (if needed)
NEXTAUTH_SECRET=random-secret-here
NEXTAUTH_URL=http://localhost:3000
```

---

## 11. Quick Reference: Key Directories

```
src/
├── app/
│   ├── api/
│   │   ├── upload/        # File upload (already exists)
│   │   ├── notes/         # Notes API (partially done)
│   │   ├── tree/          # File tree API (partially done)
│   │   ├── ai/            # ⬅️ AI endpoints (you build)
│   │   │   ├── chat/
│   │   │   └── embeddings/
│   │   └── ...
│   ├── notes/
│   │   └── page.tsx       # Main app
│   └── ...
├── components/
│   ├── layout/
│   │   └── vscode-layout.tsx    # Main 3-pane layout
│   ├── editor/                   # File viewers
│   ├── sidebar/                  # File tree
│   ├── panels/                   # Right panel (Chat, Todo, etc.)
│   └── ...
├── lib/
│   ├── storage/           # S3 client (already done)
│   ├── notes/             # Note state management
│   ├── ai/                # ⬅️ AI utilities (you build)
│   └── db/                # ⬅️ Database queries (you build)
└── ...

prisma/
├── schema.prisma          # ⬅️ Database schema (you create)
└── migrations/            # ⬅️ Migration history
```

---

## 12. Common Commands You'll Use

```bash
# Database
pnpm exec prisma migrate dev --name init  # Create migration
pnpm exec prisma studio                   # GUI database editor
pnpm exec prisma generate                 # Regenerate types

# Testing
pnpm test                                  # Run all tests
pnpm test src/app/api/ai/chat.test.ts     # Test specific file

# Linting
pnpm lint --fix                            # Auto-fix lint issues
```

---

## 13. Documentation to Read

- **Architecture:** See `S3_INTEGRATION.md` + `VSCODE_UI_QUICKSTART.md`
- **UI Components:** Check `src/components/` files
- **State Management:** `src/lib/notes/state/layout.zustand.ts`
- **S3 Storage:** `src/lib/storage/s3.ts`

---

## 14. Got Questions?

- **Setup issues:** Check this file first
- **UI/UX questions:** Look at `VSCODE_UI_QUICKSTART.md`
- **Architecture:** See `S3_INTEGRATION.md`
- **Git conflicts:** Coordinate with the team
- **LLM stuff:** Check Vercel AI SDK docs: https://sdk.vercel.ai

---

## 15. Deployment Target

- **Frontend:** AWS Amplify (auto-deploys on `main` push)
- **Database:** AWS RDS PostgreSQL (eu-north-1)
- **Storage:** AWS S3 (our-chum-bucket)
- **API:** Runs on Next.js (same as frontend)

---

**Ready? Let's build RAG! 🚀**

Pushed: `805f7f6`  
Team: 3 members (you + 2 friends)  
Timeline: 5 weeks (1 week/phase)
