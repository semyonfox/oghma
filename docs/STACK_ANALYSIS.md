# OghmaNotes: Stack Analysis & SRS Discrepancies

**Generated:** 2025-03-06  
**Status:** Critical inconsistencies identified between SRS requirements and current implementation

---

## Executive Summary

The current implementation has **deviated significantly** from the original SRS. The project has adopted a **Next.js monolith architecture** instead of a microservices approach, and is using **PostgreSQL** instead of **MariaDB**. Critically, **zero RAG/AI features** have been implemented despite being central to the SRS.

### Current Phase
- ✅ Core infrastructure (Auth, Notes, File Storage)
- ✅ Basic PDF support (Upload, annotations)
- ❌ **RAG Pipeline (not started)**
- ❌ **Quiz Generation (not started)**
- ❌ **Flashcards & SM-2 (not started)**
- ❌ **LMS Integration (not started)**
- ❌ **Analytics Dashboard (not started)**

---

## 1. DATABASE STACK MISMATCH

### SRS Specification
```
Database: MariaDB (native vector support)
- Vector columns: 1536-dim embeddings (text-embedding-3-small)
- Hybrid search: FULLTEXT (keyword) + vector (semantic)
- Storage: MariaDB HNSW indexes for efficient similarity search
```

### Current Implementation
```
Database: PostgreSQL (12.x+)
- Vector support: Via pgvector extension
- Full-text search: PostgreSQL built-in FULLTEXT
- Current use: Auth, notes, tree structure only
```

### Impact Analysis
| Feature | SRS Requires | Currently | Status |
|---------|--------------|-----------|--------|
| Vector embeddings | MariaDB native | pgvector extension | ⚠️ Possible but requires extension |
| FULLTEXT search | MariaDB | PostgreSQL | ✅ Supported |
| Hybrid search | Built-in | Manual implementation needed | ❌ Not implemented |
| Vector indexing | MHNSW | pgvector ivfflat/HNSW | ⚠️ Different but viable |

**Recommendation:** PostgreSQL + pgvector is viable but requires:
1. Installing pgvector extension in production RDS
2. Creating vector columns in schema
3. Building hybrid search query logic
4. Testing performance at scale (millions of vectors)

---

## 2. APPLICATION ARCHITECTURE CHANGE

### SRS Specification (Microservices)
```
┌─────────────────┐
│   Frontend      │  Next.js PWA
├─────────────────┤
│  API Service    │  Node.js REST API
├─────────────────┤
│  RAG Pipeline   │  Dedicated service
├─────────────────┤
│  Workers        │  BullMQ + Redis
└─────────────────┘
      ↓
┌─────────────────┐
│ MariaDB + S3    │
└─────────────────┘
```

### Current Implementation (Monolith)
```
┌─────────────────────────────────────┐
│      Next.js Full Stack             │
├─────────────────────────────────────┤
│  Frontend (React 19 + Tailwind)     │
│  API Routes (built-in)              │
│  Auth (bcryptjs + JWT)              │
│  File uploads (AWS S3)              │
│  Email (Nodemailer + AWS SES)       │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│     PostgreSQL + AWS S3             │
└─────────────────────────────────────┘
```

### Implications
| Aspect | SRS | Current | Trade-off |
|--------|-----|---------|-----------|
| **Scalability** | Separate services | Single instance | ❌ Less elastic; can't scale services independently |
| **Dev Velocity** | 3 separate codebases | 1 monolith | ✅ Faster iteration, easier debugging |
| **Deployment** | Multiple Docker images | Single Next.js build | ✅ Simpler CI/CD |
| **Background Jobs** | BullMQ + Redis | Not implemented | ❌ Long-running jobs block API |
| **Code Separation** | Clear boundaries | Mixed concerns | ⚠️ Can become harder to maintain |

**Status:** Architectural change is pragmatic but diverges from SRS. Background job system (BullMQ) not implemented yet.

---

## 3. CORE RAG PIPELINE: COMPLETELY MISSING

### SRS Requirements
```
FR-5: PDF Ingestion
  ✅ FR-5.1: Upload PDFs up to 50MB
  ✅ FR-5.2: Extract text (pdf-parse)
  ⚠️ FR-5.3: OCR for scanned PDFs (architecture ready, not implemented)
  ❌ FR-5.4: Ingestion progress display
  ❌ FR-5.5: Semantic chunking (500 tokens, 50-100 overlap)
  ❌ FR-5.6: Preserve metadata (page numbers, headers)
  ❌ FR-5.7: Generate embeddings (OpenAI text-embedding-3-small)
  ❌ FR-5.8: Background job processing (BullMQ)
  ❌ FR-5.9: Error handling for rate limits

FR-6: RAG Chat
  ❌ FR-6.1-6.9: Entire feature not started
  - No hybrid search
  - No LLM integration
  - No citations
  - No streaming responses
```

### What's Actually Implemented
- ✅ PDF upload to S3
- ✅ PDF annotations (highlighting, notes)
- ❌ Text extraction beyond basic parse
- ❌ Chunking
- ❌ Embeddings
- ❌ Vector search
- ❌ LLM integration

**Critical Gap:** The entire value proposition of OghmaNotes (RAG learning) is not implemented.

---

## 4. AUTHENTICATION & USER MANAGEMENT

### SRS Requirements
| Feature | Status | Notes |
|---------|--------|-------|
| **FR-1.1:** Register with email/password | ✅ Implemented | bcryptjs hashing |
| **FR-1.2:** Verification email via SES | ✅ Partial | Nodemailer configured, SES also available |
| **FR-1.3:** Email verification required | ⚠️ Partial | Infrastructure exists, enforcement varies |
| **FR-1.4:** JWT token (24hr validity) | ✅ Implemented | jsonwebtoken library |
| **FR-1.5:** Error messages | ✅ Basic | Functional but could be more detailed |
| **FR-1.6-1.7:** Password reset | ✅ Implemented | AWS SES integration ready |
| **FR-1.8:** Logout | ✅ Implemented | JWT invalidation via headers |
| **FR-1.9:** Bcrypt 10+ salt rounds | ✅ Implemented | bcryptjs default |
| **FR-2.x:** User profile management | ⚠️ Partial | Schema exists, UI incomplete |
| **FR-3.x:** Course information collection | ⚠️ Partial | Not in registration flow yet |

**Status:** Authentication core is solid. User profile management incomplete.

---

## 5. STORAGE & FILE MANAGEMENT

### SRS vs Actual
| Feature | SRS | Actual | Gap |
|---------|-----|--------|-----|
| S3 object storage | ✅ Required | ✅ Implemented | ✅ None |
| Presigned URLs | ✅ 1-hour expiry | ✅ Implemented | ✅ None |
| Storage quota (5GB/user) | ✅ Required | ❌ Not enforced | ⚠️ Needs implementation |
| File types | PDFs, Markdown, images | PDFs, Markdown, images, docs | ✅ Exceeds SRS |
| S3-compatible support | Wasabi, B2 | Minio, AWS S3 | ✅ Good |

---

## 6. MISSING FEATURES (High Priority in SRS)

### Must Have Features
| Feature | SRS Tier | Current Status | Impact |
|---------|----------|------------------|--------|
| RAG Chat | Must Have | ❌ Not started | Critical blocker for MVP |
| PDF indexing | Must Have | ⚠️ Partial (no embeddings) | Can't search PDFs |
| Note search (keyword) | Must Have | ⚠️ Partial (no FULLTEXT) | Can't find notes |
| Offline support | Must Have | ❌ PWA framework ready, features not done | Missing core feature |
| Semantic search | Must Have | ❌ Not started | Requires vectors |

### Should Have Features
| Feature | Current Status | Priority |
|---------|-----------------|----------|
| LMS Integration (Canvas) | ❌ Not started | Medium |
| Calendar/Timetable | ❌ Not started | Medium |
| Quiz generation | ❌ Not started | Medium |
| Analytics dashboard | ❌ Not started | Medium |

### Nice to Have Features
| Feature | Current Status | Priority |
|---------|-----------------|----------|
| Spaced repetition | ❌ Not started | Low |
| Study groups | ❌ Not started | Low |
| i18n support | ❌ Framework ready | Low |
| Knowledge graph | ❌ Not started | Low |

---

## 7. DEPENDENCIES & TECH DECISIONS

### What the SRS Assumed
```
- Redis + BullMQ for background jobs
- MariaDB vector support
- OpenAI API integration
- Google Cloud Vision for OCR
- AWS Amplify for deployment
```

### What's Actually in package.json
```
✅ PostgreSQL (pg, postgres.js)
✅ AWS S3 SDK (@aws-sdk/client-s3)
✅ AWS SES (@aws-sdk/client-ses)
✅ Lexical editor (rich text, better than Markdown)
✅ PDF.js + react-pdf (client-side PDF rendering)
✅ Nodemailer (email)
✅ Zustand (state management)
✅ Next.js 16 + React 19
❌ Redis (not in deps)
❌ BullMQ (not in deps)
❌ Prisma (noted in package.json but not used)
❌ OpenAI (not in deps)
❌ pgvector (not installed in RDS)
```

---

## 8. DEPLOYMENT & CI/CD

### SRS Specification
```
- Docker Compose for local dev
- AWS Amplify auto-deploy from prod branch
- Optional staging environment
- Optional OpenAPI spec generation
```

### Current State
```
✅ Docker Compose exists (but references old names)
✅ AWS Amplify configured
⚠️ Environment files need cleanup
❌ No staging environment
❌ No OpenAPI spec
```

---

## 9. PROJECT NAMING INCONSISTENCIES

### Current Confusion
- **README.md:** Still says "SocsBoard"
- **docker-compose.yml:** References `your-app-web`, `your-internal-ip`, generic names
- **package.json:** Named `ct216-project`
- **Documentation:** Uses "OghmaNotes"
- **.env.example:** Mentions `oghmanotes.semyon.ie`

**Action Required:** Standardize project name across all configs.

---

## 10. RECOMMENDATIONS

### Immediate (Week 1-2)
1. **Update SRS** to match current architecture
   - Acknowledge PostgreSQL + pgvector choice
   - Note monolithic Next.js architecture
   - Remove MariaDB references
   
2. **Clean up naming**
   - Update README from "SocsBoard"
   - Fix docker-compose.yml
   - Update all env files

3. **Finalize PostgreSQL schema**
   - Add pgvector extension setup
   - Design vector column layout
   - Plan chunking strategy

### Phase 2 (Core MVP - Weeks 3-5)
1. **Implement RAG Pipeline**
   - PDF text chunking logic
   - OpenAI embedding integration
   - Hybrid search (FULLTEXT + vector)
   - Streaming LLM responses with citations

2. **Add Background Jobs**
   - Consider Bull/Redis vs simpler queue (Inngest, etc.)
   - PDF indexing async jobs
   - Email sending async jobs

3. **Implement Search**
   - Keyword search (FULLTEXT)
   - Semantic search (pgvector)
   - Hybrid ranking

### Phase 3 (Features - Weeks 5-6)
1. Quiz generation
2. Flashcard system (SM-2)
3. LMS integration (Canvas OAuth)
4. Analytics dashboard

### Not in MVP (Descope)
- Light mode / WCAG compliance (dark mode only)
- Real-time collaborative editing
- Native mobile apps (PWA only)
- Instructor dashboards
- Advanced monitoring

---

## RISK ASSESSMENT

| Risk | Severity | Mitigation |
|------|----------|-----------|
| RAG pipeline not implemented | 🔴 CRITICAL | Start immediately; consider pre-built solutions (LangChain, LlamaIndex) |
| PostgreSQL vector setup | 🟡 HIGH | Needs RDS pgvector extension; test in staging first |
| No background job system | 🟡 HIGH | Currently blocking async features; implement Bull/Redis or simpler alternative |
| Monolithic architecture limits scaling | 🟠 MEDIUM | Acceptable for MVP; can refactor later if needed |
| Storage quota not enforced | 🟠 MEDIUM | Add quota check in upload handler |
| Incomplete user profiles | 🟠 MEDIUM | Complete profile UI; add course info collection |

---

## UPDATED TECH STACK (Actual)

```yaml
Frontend:
  Framework: Next.js 16 (App Router)
  UI: React 19 + Tailwind CSS 4
  Editor: Lexical (rich text)
  PDF Viewer: PDF.js + react-pdf
  State: Zustand
  Forms: react-markdown for note display

Backend (Next.js API Routes):
  Auth: bcryptjs + jsonwebtoken (JWT)
  Database: PostgreSQL 12+ (postgres.js driver)
  Storage: AWS S3 (@aws-sdk/client-s3)
  Email: Nodemailer + AWS SES support
  CORS: next-cors middleware
  File uploads: AWS S3 presigned URLs

Database:
  Primary: PostgreSQL (RDS or local)
  Vector Search: pgvector extension (not yet installed)
  Migrations: Manual SQL or simple ORM

Deployment:
  Platform: AWS Amplify
  Auto-deploy: From prod branch
  Build: Next.js default
  Environment: Managed via Amplify console

Not Yet Implemented:
  - Redis / Background jobs
  - OpenAI / LLM integration
  - Vector embeddings
  - RAG pipeline
```

---

## APPENDIX: Files That Need Updates

1. ✏️ **README.md** - Still references "SocsBoard"
2. ✏️ **docker-compose.yml** - Generic names, comments about MariaDB
3. ✏️ **SRS.md or SRS.tex** - Create formal updated SRS
4. ✏️ **.env.example** - Clarify PostgreSQL vs MariaDB
5. ✏️ **SETUP.md** - Update with current stack
6. ✏️ **docs/ARCHITECTURE.md** - Update with missing features
7. ✅ **docs/STACK_ANALYSIS.md** - This file (new)
