# Stack Analysis

## Deviations from SRS

### Database: MariaDB → PostgreSQL + pgvector
Both support 1536-dim embeddings and full-text search. PostgreSQL + pgvector offers better team familiarity and performance.

### Architecture: Microservices → Single Next.js App
Monolithic approach for faster iteration. Can be split later if needed.

**Trade-off:** Flexibility in scaling vs. simplicity in deployment

### Background Jobs: Not yet implemented
BullMQ + Redis planned later if needed (large PDFs, batch embeddings).

### LLM Keys: User-Provided (not backend-managed)
Users paste API keys (stored encrypted in browser). No backend secrets, lower operational risk.

**Benefits:** No key management, users control costs, flexible provider support

## Feature Status

| Feature | Status |
|---------|--------|
| Auth (register, login, password reset) | Complete |
| Notes (CRUD, folders, offline) | Complete |
| PDF upload and annotation | Complete |
| File sync (S3) | Complete |
| Search (fuzzy + semantic) | Phase 1 In Progress |
| RAG chat | Phase 2 Planned |
| Quizzes | Phase 3 Planned |
| Flashcards | Phase 3 Planned |
| LMS integration | Phase 3 Planned |
| Analytics | Phase 3 Planned |

## Performance Targets

| Operation | Target |
|-----------|--------|
| Fuzzy search | <5ms (GIN index) |
| Semantic search | <50ms (ivfflat) |
| PDF indexing (50MB) | <2min (async) |
| Note sync | <2s |
| Page load | <4s |

## Risks

| Risk | Mitigation |
|------|-----------|
| RAG deadline pressure | Proven patterns, parallel work |
| Vector search at scale | Load test 10K+ vectors |
| S3 costs | Monitor and cap usage |
| Database connections | RDS pool sufficient for MVP |

## Decisions Made

- **PostgreSQL over MariaDB:** Team expertise, good pgvector support
- **Monolithic Next.js:** Faster iteration, simpler deployment
- **User-managed API keys:** No backend secrets, more flexible
- **AWS S3 only:** Consistent local/prod setup
- **Cmd+K search UI:** Power-user friendly, minimal distraction
