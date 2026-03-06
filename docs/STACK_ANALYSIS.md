# Stack Analysis

## What Changed from Original SRS

### Database: MariaDB → PostgreSQL + pgvector

Original spec wanted MariaDB's native vectors. We use PostgreSQL + pgvector extension instead.

- ✅ Both support 1536-dim embeddings
- ✅ Both have full-text search (GIN indexes)
- ✅ Performance comparable (~5ms keyword, ~50ms semantic)
- ✅ pgvector is well-maintained

Decision: PostgreSQL is what the team knows. pgvector works fine.

### Architecture: Microservices → Single Next.js App

Original spec had separate frontend, API, RAG pipeline, and worker services. We built everything in Next.js.

**Why:** Faster to ship. One codebase, one deployment. Can split services later if needed.

**Trade-offs:**
- ✅ Faster iteration
- ✅ Simpler deployment (one Amplify build)
- ❌ Scaling is less flexible
- ❌ Long tasks can block API (mitigated with async jobs later)

### Background Jobs: BullMQ + Redis → TBD

Original spec required job queues. Not implemented yet, not blocking MVP.

Plan: Add later if needed (for large PDF indexing, batch embeddings).

### LLM Keys: Backend-Managed → User-Provided

Original: App would store and manage API keys.  
Actually: Users provide their own keys (stored in browser).

**Benefits:**
- No backend secrets to manage
- Users pay their own provider costs
- Supports any LLM (OpenAI, Anthropic, local models)

## What's Built

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (register, login, password reset) | ✅ Complete | JWT, bcrypt |
| Notes (CRUD, folders, offline) | ✅ Complete | Markdown, PWA |
| PDF upload, annotation | ✅ Complete | Highlighting, comments |
| File sync (S3) | ✅ Complete | Auto-sync when online |
| Search (fuzzy + semantic) | 🔄 Phase 1 | Planned, architecture done |
| RAG chat | 🔄 Phase 2 | In progress |
| Quizzes | ⏳ Phase 3 | Not started |
| Flashcards (SM-2) | ⏳ Phase 3 | Not started |
| LMS integration | ⏳ Phase 3 | Not started |
| Analytics | ⏳ Phase 3 | Not started |

## Performance Targets

| Operation | Target | Status |
|-----------|--------|--------|
| Fuzzy search | <5ms | ✅ Achievable with GIN index |
| Semantic search | <50ms | ✅ Achievable with ivfflat |
| PDF indexing (50MB) | <2min | ✅ Async, no blocker |
| Note sync | <2s | ✅ Tested ~500ms |
| Page load | <4s | ✅ Tested ~2.5s |

## Risk Register

| Risk | Priority | Mitigation |
|------|----------|-----------|
| RAG pipeline not done by deadline | 🔴 High | Started Phase 2, using proven patterns |
| Vector search performance at scale | 🟡 Medium | Test with 10K+ vectors before prod |
| S3 costs | 🟢 Low | Monitor usage, cap if needed |
| PostgreSQL connection limits | 🟢 Low | RDS default pool (20) is enough for MVP |

## Decisions Made

- **PostgreSQL over MariaDB:** Team expertise, good pgvector support
- **Monolithic Next.js:** Faster iteration, simpler deployment
- **User-managed API keys:** No backend secrets, more flexible
- **AWS S3 only:** Consistent local/prod setup
- **Cmd+K search UI:** Power-user friendly, minimal distraction
