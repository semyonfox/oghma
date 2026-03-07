# OghmaNotes SRS Documentation Guide

This guide helps you navigate and understand the SRS for OghmaNotes, the AI-powered learning platform.

## Quick Navigation

### For Different Audiences

**Stakeholders & PMs** (5 min overview)
1. Start with `docs/SRS.pdf` — stakeholder-friendly format
2. Skim the "Quick Summary" section below
3. Reference `PROGRESS.md` for current status

**Team Members** (implementing features)
1. Read `docs/SRS.tex` — comprehensive technical specification
2. Review `SEARCH_ARCHITECTURE_PLAN.md` for Phase 1 details
3. Check `SRS_ANALYSIS.md` for alignment verification
4. Consult `PROGRESS.md` for issue assignments

**QA & Testing** (validating requirements)
1. Use `SRS_ANALYSIS.md` section 6 — Acceptance Criteria Checklist
2. Reference the performance targets in `SRS_ANALYSIS.md` section 2
3. Review API endpoints in `docs/SRS.tex` section 8
4. Use `PROGRESS.md` for feature status

**Database/DevOps** (infrastructure)
1. Check `docs/SRS.tex` section 6 — Tech Stack
2. Review `database/migrations/` for schema
3. Reference database schema in `SRS_ANALYSIS.md` section 2
4. Consult `docs/ARCHITECTURE.md` for deployment details

---

## Document Index

### Primary SRS Documents

| File | Lines | Purpose | Audience | Time |
|------|-------|---------|----------|------|
| `docs/SRS.pdf` | ~65 | Formal spec (PDF, stakeholder-friendly) | Stakeholders, PMs | 15 min |
| `docs/SRS.tex` | 465 | Complete technical specification | Team, all roles | 45 min |
| `SRS_ANALYSIS.md` | 682 | Detailed alignment & implementation guide | Team members, QA | 60 min |

### Supporting Documentation

| File | Lines | Purpose | Audience |
|------|-------|---------|----------|
| `PROGRESS.md` | 243 | Phase tracking, issue assignments | Team, PMs |
| `SEARCH_ARCHITECTURE_PLAN.md` | 548 | Phase 1 detailed implementation spec | Developers |
| `docs/LLM_STRATEGY.md` | ~60 | User-managed API key approach | Backend devs |
| `docs/ARCHITECTURE.md` | ~400 | Technical architecture overview | Architects |
| `README.md` | 91 | Quick start guide | Developers |
| `SETUP.md` | N/A | Development environment setup | Developers |

---

## Key Sections by Role

### Frontend Developer
- **Read:** `docs/SRS.tex` sections 1-3, 5 (Intro, Scope, Tech Stack, NFR - Usability)
- **Reference:** `SRS_ANALYSIS.md` section 4 (Project Structure - frontend components)
- **Study:** Component tree in `src/components/` and `SEARCH_ARCHITECTURE_PLAN.md`
- **Implement:** Phase 1 Issues #21-25, then Phase 2-3

### Backend Developer
- **Read:** `docs/SRS.tex` sections 4, 6-8 (Functional, Tech Stack, API, Database)
- **Reference:** `SRS_ANALYSIS.md` sections 2, 5 (Requirements, Alignment)
- **Study:** `database/migrations/` and `docs/ARCHITECTURE.md`
- **Implement:** Phase 1 Issues #21-25, then Phase 2-3

### Database/DevOps Engineer
- **Read:** `docs/SRS.tex` section 6 (Tech Stack) and section 8 (Database)
- **Reference:** `database/migrations/` for schema
- **Study:** `SRS_ANALYSIS.md` section 2 (Database Schema details)
- **Setup:** Docker, PostgreSQL with pgvector, AWS RDS/S3/Amplify

### QA/Test Engineer
- **Read:** `docs/SRS.tex` sections 1-7 (all requirements + NFR)
- **Reference:** `SRS_ANALYSIS.md` section 6 (Acceptance Criteria)
- **Create:** Test cases from Phase breakdown in `PROGRESS.md`
- **Verify:** Performance targets in section 2, Security in section 2

### Project Manager
- **Read:** `docs/SRS.pdf` (stakeholder PDF) + `PROGRESS.md`
- **Track:** 20 issues across 4 phases on GitHub Project Board
- **Reference:** `SRS_ANALYSIS.md` section 8 for phase dependencies
- **Report:** Status using phase completion metrics

---

## Feature Breakdown

### Phase 0: Foundation (✅ 100% Complete)
**Duration:** Foundation (3 issues, CLOSED)

**What's Done:**
- User authentication (register, login, password reset, JWT)
- Markdown notes with offline support (PWA)
- PDF upload to S3
- Folder hierarchy
- Soft-delete with 7-day recovery
- UUID v7 database (tested on production)

**Reference:** SRS sections 2.1-2.2 (Authentication & Notes)

---

### Phase 1: Search (🔄 In Progress)
**Duration:** ~2 weeks  
**Team:** Search implementation (0/5 issues assigned)  
**Detailed Spec:** `SEARCH_ARCHITECTURE_PLAN.md` (548 lines)

**Issues:**
- #21: Implement `/api/search` endpoint (fuzzy + semantic)
- #22: Implement `/api/notes/:id/embed` async job
- #23: Enhance `/api/tree` endpoint with sorting
- #24: Build Cmd+K search overlay UI
- #25: Load test search with 1000+ vectors

**Requirements from SRS:**
- Keyword search: PostgreSQL FULLTEXT (~5ms)
- Semantic search: pgvector embeddings (~50ms)
- Hybrid search: Combined (~100ms)
- Filters by tags, module, document type, semester
- Cmd+K keyboard-first overlay
- Display relevance scores and snippets

**Reference:** SRS sections 2.3 (PDFs), 2.4 (Search), and section 7 (NFR - Performance)

---

### Phase 2: RAG Pipeline (⏳ Planned)
**Duration:** ~3 weeks (starts after Phase 1)  
**Team:** RAG implementation  
**Detailed Spec:** `docs/LLM_STRATEGY.md`

**Issues:**
- #31: PDF text extraction and chunking
- #32: OpenAI embedding integration (user-managed keys)
- #33: Vector similarity search and RAG context retrieval
- #34: Chat UI with streaming responses and citations
- #35: RAG pipeline integration tests and benchmarking

**Requirements from SRS:**
- PDF text extraction
- Semantic chunking (500 tokens, 50-100 overlap)
- Generate and store embeddings (OpenAI, 1536 dims)
- Hybrid search to retrieve relevant chunks
- Chat interface for free-text questions
- Include citations with page numbers and sections
- Clickable citations linking to PDF location
- Stream LLM response token-by-token
- Rate responses (thumbs up/down)
- End-to-end latency: ≤ 3 seconds

**Key Design Decision:** Users provide their own OpenAI API keys (no backend cost)

**Reference:** SRS sections 2.2 (PDFs), 2.5 (RAG Chat), and section 7 (NFR - Performance)

---

### Phase 3: Features (⏳ Planned)
**Duration:** ~3 weeks (starts after Phase 2)  
**Team:** Feature team

**Issues:**
- #26: Quiz generation system
- #27: Flashcard system (SM-2 spaced repetition)
- #28: Canvas LMS integration
- #29: Calendar and timetable view
- #30: Analytics dashboard

**Requirements from SRS:**
- **Quizzes:** Generate 5-10 questions, multiple choice/short answer/T/F, difficulty levels, optional timed mode, performance tracking
- **Flashcards:** SM-2 spaced repetition, daily review queue, flip and rate, progress metrics, cross-device persistence
- **Canvas LMS:** OAuth connection, import assignments, auto-schedule study sessions, daily sync + on-demand
- **Calendar:** Week/month views, display reviews/quizzes/assignments, auto-schedule, export to iCal
- **Analytics:** Study time tracking, quiz scores, identify weak topics, performance charts

**Reference:** SRS sections 2.6-2.10 (Quizzes, Flashcards, Canvas, Calendar, Analytics)

---

## Performance Targets (SRS Section 7.1)

All targets must be verified before ship:

| Operation | Target | Notes |
|-----------|--------|-------|
| RAG query (end-to-end) | ≤ 3 sec | Includes search + LLM generation |
| PDF indexing (50MB) | ≤ 2 min | Chunking + embedding generation |
| Keyword search | ≤ 5ms | PostgreSQL FULLTEXT |
| Semantic search | ≤ 50ms | pgvector with ivfflat indexing |
| Hybrid search | ≤ 100ms | Both searches combined |
| Quiz generation | ≤ 5 sec | LLM generation + formatting |
| Note sync (500KB) | ≤ 2 sec | Upload to S3 |
| Cold page load | ≤ 4 sec | First meaningful paint |
| Cached page load | ≤ 2 sec | Subsequent page loads |
| Server concurrency | 10+ req | Concurrent request handling |

**Verification:** Load testing in Phase 1 issue #25, Phase 2 issue #35, Phase 3 benchmarks

---

## Security Requirements (SRS Section 7.2)

**Must be verified by QA:**

- APIs require JWT (except login, register, verify)
- Passwords hashed with bcrypt (salt ≥ 10)
- HTTPS only (TLS 1.2+)
- CORS restricts approved origins
- Rate limiting on public endpoints
- Credentials in environment variables, encrypted at rest
- S3 presigned URLs expire in 1 hour
- Vector queries filtered by user ID
- Password reset tokens: 1 hour, single-use
- Email verification tokens: 24 hours

**Test Coverage:** Security tests should cover each requirement

---

## Reliability Requirements (SRS Section 7.3)

**Must be verified by ops/QA:**

- 99% availability during grading window
- Automated database backups (AWS RDS)
- Failed jobs retry 3 times with exponential backoff
- Graceful error handling for external API failures
- User sessions survive service restarts
- PWA reconnects within 30 seconds of network loss

**Verification:** Chaos engineering tests, failover scenarios, network simulation

---

## Acceptance Criteria (SRS Section 9)

The system ships when ALL of these are met:

1. **All features implemented and verified**
   - [ ] Foundation: ✅ Complete
   - [ ] Phase 1: Fuzzy + semantic search working at scale
   - [ ] Phase 2: RAG pipeline with proper citations
   - [ ] Phase 3: Quizzes, flashcards, Canvas, analytics

2. **Non-functional requirements met**
   - [ ] Performance targets verified (load testing)
   - [ ] Security requirements verified (penetration testing)
   - [ ] Reliability requirements verified (chaos engineering)

3. **`docker compose up` works from scratch**
   - [ ] Database migrations run automatically
   - [ ] Services start without manual intervention

4. **E2E demo passes**
   - [ ] Register → verify → upload PDF → ask RAG question → generate quiz → review flashcard
   - [ ] Demonstrate entire workflow to stakeholders

5. **AWS Amplify auto-deploy working**
   - [ ] Production branch deploys automatically
   - [ ] Staging environment available for testing

6. **Code coverage ≥ 70%**
   - [ ] Unit tests: Core logic
   - [ ] Integration tests: API endpoints
   - [ ] E2E tests: Critical user flows

7. **Stakeholder approval**
   - [ ] Product stakeholders sign off
   - [ ] Academic team approves for use

---

## How to Use This Guide

### Getting Started
1. Read the "Quick Navigation" section above based on your role
2. Skim the 1-2 primary documents for your role
3. Reference supporting docs as needed
4. Check `PROGRESS.md` for current issue assignments

### During Implementation
1. Reference the Feature Breakdown section above
2. Find your issue number in `PROGRESS.md`
3. Read detailed spec from `SEARCH_ARCHITECTURE_PLAN.md` (Phase 1) or `docs/SRS.tex` (other phases)
4. Check `SRS_ANALYSIS.md` section 5 for alignment details
5. Update `PROGRESS.md` when issue is completed

### Before Release
1. Go through Acceptance Criteria section above
2. Reference Security, Reliability, and Performance sections
3. Create test plan from SRS section 7 (NFR)
4. Prepare E2E demo demo from section 9

---

## Key Links

| Resource | Link |
|----------|------|
| GitHub Project Board | https://github.com/users/semyonfox/projects/5 |
| SRS Specification | docs/SRS.pdf (stakeholders) or docs/SRS.tex (team) |
| Phase 1 Details | SEARCH_ARCHITECTURE_PLAN.md |
| Implementation Guide | SRS_ANALYSIS.md |
| Progress Tracking | PROGRESS.md |
| LLM Strategy | docs/LLM_STRATEGY.md |
| Architecture | docs/ARCHITECTURE.md |

---

## FAQ

**Q: Where do I find the complete requirements?**  
A: `docs/SRS.tex` contains the full specification. For a summary, use `SRS_ANALYSIS.md`.

**Q: What should I implement first?**  
A: Check `PROGRESS.md`. Foundation is done. Next: Phase 1 issues #21-25 (search).

**Q: How do I know if my implementation matches the SRS?**  
A: Use `SRS_ANALYSIS.md` section 5 for detailed alignment mapping.

**Q: What are the performance targets?**  
A: See section above or `docs/SRS.tex` section 7.1 for full list.

**Q: Who approves completed work?**  
A: Team lead reviews completed issues against SRS requirements before closing.

**Q: What if requirements change?**  
A: Update `docs/SRS.tex` first, then coordinate with team. Do NOT change SRS mid-phase without discussion.

**Q: How do I report progress?**  
A: Update `PROGRESS.md` and close GitHub issues. PMs will track against this for stakeholder updates.

---

**Version:** 2.0  
**Last Updated:** 2025-03-06  
**Team:** Samuel Regan, Semyon Fox, Shreyansh Singh  
**For:** OghmaNotes CT216 Software Engineering Project
