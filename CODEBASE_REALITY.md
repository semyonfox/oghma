# OghmaNotes Codebase Analysis: Reality vs Plan

**Analysis Date:** March 7, 2025  
**Status:** Foundation Complete, Phase 1 In Progress, Phase 2-3 Planned  
**Repository:** /home/semyon/code/university/ct216-software-eng/oghmanotes

---

## 1. WHAT'S ACTUALLY IMPLEMENTED (Core System)

### ✅ Authentication (Complete & Working)
- **Login/Register:** Full implementation with bcrypt password hashing
- **Database:** PostgreSQL `app.login` table with UUID v7 primary keys
- **Session Management:** JWT tokens + HTTP-only cookies
- **Security Features:**
  - Rate limiting (tracked in-memory)
  - Account lockout after 5 failed attempts
  - Password validation (min 8 chars, complexity rules)
- **Password Reset:** Email-based flow with secure tokens
- **Location:** `/src/app/api/auth/` (login, register, password-reset, logout, me)

### ✅ Notes Storage & CRUD (Complete)
- **Storage Architecture:** AWS S3 + MinIO compatible
  - Notes stored as JSON files in S3: `notes/{noteId}/note.json`
  - Tree structure in S3: `tree/tree.json`
  - Index maintained: `notes/index.json`
- **API Endpoints:**
  - `GET /api/notes` - List all notes with field filtering & pagination
  - `POST /api/notes` - Create new note
  - `GET /api/notes/:id` - Get single note
  - `PUT /api/notes/:id` - Update note
  - `DELETE /api/notes/:id` - Delete note
- **Note Model:**
  ```typescript
  {
    id: string;           // UUID v7
    title: string;
    content?: string;
    pid?: string;         // parent ID (for hierarchy)
    deleted: NOTE_DELETED;
    shared: NOTE_SHARED;
    pinned: NOTE_PINNED;
    editorsize: EDITOR_SIZE | null;
  }
  ```

### ✅ Tree Organization (Complete)
- **Hierarchical Structure:** Parent-child note relationships
- **API Endpoints:**
  - `GET /api/tree` - Fetch entire tree with pagination
  - `POST /api/tree` - Move items or mutate properties (expand/collapse)
  - `POST /api/tree/sync` - Sync tree changes
- **Features:** Drag-and-drop support (move/mutate actions)
- **Storage:** S3-backed with index caching

### ✅ File Upload & Storage (Complete)
- **Endpoint:** `POST/GET /api/upload`
- **Features:**
  - File upload with presigned S3 URLs
  - File retrieval with signed URLs (expiry: 1 hour)
  - Storage path: `notes/{noteId}/{fileName}`
- **Limits:** MAX_FILE_SIZE = 100MB (from env)

### ✅ Database Foundation (Complete)
- **Schema:** PostgreSQL with UUID v7
- **Tables:**
  - `app.login` - Users (UUID v7 id)
  - `app.notes` - Notes (UUID v7 id)
  - `app.documents` - Documents (UUID v7 id) [exists but not used in UI]
  - `app.chunks` - Embeddings (UUID v7 id) [exists but not used yet]
- **Indexes:** Created for performance (user_id, created_at, email)
- **Migrations:** 2 applied
  - 001: Initial schema with UUID v7
  - 002: UUID v7 migration for all tables
- **Security:** Soft deletes, cascading deletes, timestamp triggers

### ✅ UI Framework & Editor (Complete)
- **Framework:** Next.js 16 + React 19
- **Editor:** Lexical rich text editor
- **Layout:** VSCode-style (icon nav, sidebar, split panes)
- **Components:**
  - Markdown editor with live preview
  - Source code editor
  - Image/video viewers
  - Command palette (Cmd+K) - skeleton exists, not fully integrated
  - Backlinks panel
  - Properties panel
- **State Management:** Zustand stores
  - `editor.zustand.ts` - Editor state
  - `layout.zustand.ts` - Layout state
  - `note.ts` - Note state
  - `tree.ts` - Tree state

### ✅ Email System (Partial)
- **Configured:** AWS SES integration ready
- **Implementation:** Used for password reset
- **Setup:** Environment variables present
- **Status:** Working but limited to auth flows

### ✅ Settings & Configuration (Partial)
- **Endpoint:** `GET/POST /api/settings`
- **Stored:** User preferences
- **Features:** Theme, language, editor settings

---

## 2. FEATURES GENUINELY IN-PROGRESS (Phase 1)

### 🔄 Search Implementation (Active - GitHub Issues #21-25)

**Current Status:** Architecture designed, components stubbed, endpoints NOT implemented

**What Exists:**
- Search UI component in command palette
- Local search utilities (`src/lib/notes/utils/search.ts`) - regex-based fuzzy search
- Search state management (`src/lib/notes/state/search.ts`)
- `SEARCH_ARCHITECTURE_PLAN.md` with detailed API specs

**What's Missing (Needs Implementation):**
1. **Backend Search Endpoint** (`GET /api/search`)
   - No actual implementation exists
   - Should support: `?type=fuzzy|semantic&q=query&limit=20&offset=0`
   - Requires PostgreSQL full-text search setup (not yet created)

2. **Semantic Search**
   - No embedding generation endpoint (`/api/notes/:id/embed`)
   - Embeddings table (`app.chunks`) exists but unused
   - No vector similarity search logic
   - pgvector extension installed but not used in queries

3. **Tree Sorting/Filtering**
   - `POST /api/tree` exists but only handles move/mutate
   - Sorting metadata schema not yet added (planned: `sort_by` column)
   - Only alphabetical sorting mentioned

4. **Cmd+K Overlay**
   - Component exists but not connected to API
   - Local search only, no backend integration

**Design Decisions Already Made:**
- Semantic search as primary (fallback to fuzzy)
- Async embedding jobs (mentions Bull queue - not implemented)
- Sort default: alphabetical
- Vector storage: 1536-dim (OpenAI size) in `embedding` column

---

## 3. FEATURES MARKED AS PLANNED (Never Started)

### ❌ Phase 2: RAG Pipeline (GitHub Issues #31-35)
**Status:** Planned only - NO CODE EXISTS

**Planned Features:**
1. PDF text extraction and chunking (Issue #31)
   - Code exists: `src/lib/chunking.ts` (500-char chunks)
   - Extraction skeleton: `src/app/api/extract/route.ts` (DISABLED - "TODO: enable when backend services are ready")
   - NOT connected to any UI

2. OpenAI embedding integration (Issue #32)
   - Code exists: `src/lib/embeddings.ts` (STUB - expects `EMBEDDING_API_URL`)
   - No actual OpenAI client integration
   - No prompt token management
   - Unclear how user API keys handled

3. Vector similarity search (Issue #33)
   - No implementation
   - Database columns exist but not queried
   - Would depend on #31 and #32

4. Chat UI with streaming (Issue #34)
   - No components
   - No chat state management
   - No chat API endpoints

5. RAG pipeline integration tests (Issue #35)
   - No tests exist

**Design Decision:** User-managed API keys (mentioned in `docs/LLM_STRATEGY.md`)

### ❌ Phase 3: Advanced Features (GitHub Issues #26-30)
**Status:** Planned only - NO CODE EXISTS

1. **Quiz Generation** (Issue #26)
   - No components
   - No data model
   - No API endpoints
   - No database schema

2. **Flashcard System with SM-2** (Issue #27)
   - No components
   - SM-2 spaced repetition algorithm not implemented
   - No database schema for flashcards

3. **Canvas LMS Integration** (Issue #28)
   - TODO comments exist in codebase
   - No OAuth implementation
   - No Canvas API client

4. **Calendar/Timetable View** (Issue #29)
   - No components
   - No calendar state
   - No data model

5. **Analytics Dashboard** (Issue #30)
   - No components
   - No analytics data collection
   - No endpoints

---

## 4. DESIGN CHANGES FROM ORIGINAL SRS

### 📋 Storage Architecture
**SRS Plan:** PostgreSQL-only relational storage  
**Actual Implementation:** Hybrid S3 + PostgreSQL
- Notes metadata in PostgreSQL
- Note content stored in S3 as JSON files
- Tree structure in S3
- **Rationale:** Scales better, supports offline sync, aligns with Notea architecture

### 🔐 Authentication
**SRS Plan:** OAuth + multi-provider support (Google, Microsoft, GitHub, Apple)  
**Actual Implementation:** Email/password only with JWT
- TODO comments exist for social login
- Not implemented, complexity deferred
- **Rationale:** MVP authentication, social providers add complexity

### 🔎 Search
**SRS Plan:** Fuzzy + semantic on upload (sync)  
**Actual Implementation:** Async + background jobs (mentioned but not implemented)
- Semantic search deferred to background job (Bull queue mentioned)
- **Rationale:** Prevents UI blocking on embedding generation

### 📚 Database Schema
**SRS Plan:** Single `notes` table with all fields  
**Actual Implementation:** Distributed across multiple tables
- `app.login` - Users
- `app.notes` - Note metadata
- `app.documents` - Document storage (parallel to notes)
- `app.chunks` - Embeddings/vectors (separate from content)
- **Rationale:** Better separation of concerns, query optimization

---

## 5. WHAT THE CODEBASE ACTUALLY SUPPORTS (Technically)

### Database Capabilities
- ✅ UUID v7 primary keys (all tables migrated)
- ✅ Soft deletes (deleted_at columns)
- ✅ Cascading deletes (foreign key constraints)
- ✅ PostgreSQL full-text search setup planned but NOT YET ENABLED
- ✅ pgvector extension installed, NOT YET USED
- ❌ Vector indexes (ivfflat) designed but not created
- ❌ Trigger-based search_vector updates designed but not implemented

### API Capabilities
- ✅ CRUD operations (notes, tree)
- ✅ File uploads/downloads
- ✅ Pagination & field filtering
- ✅ JWT authentication
- ❌ Search (endpoint exists in plan, not implemented)
- ❌ Embedding jobs (not implemented)
- ❌ Vector similarity queries (not implemented)

### Frontend Capabilities
- ✅ Markdown editing with split view
- ✅ File tree with drag-and-drop
- ✅ Theme switching
- ✅ Offline support (PWA-ready with service workers)
- ✅ Real-time sync status indicators
- ❌ Search overlay (component exists, not connected)
- ❌ Chat interface (not started)
- ❌ Quiz/flashcard UI (not started)

### Deployment Ready
- ✅ Docker setup (Dockerfile exists)
- ✅ AWS Amplify config (amplify.yml)
- ✅ Environment variable structure
- ✅ S3 + PostgreSQL integration

---

## 6. HALF-BUILT VS ABANDONED FEATURES

### Half-Built Features
1. **Command Palette/Search** (50% complete)
   - UI: Done (`command-palette.tsx` - 298 lines)
   - State: Done (`search.ts` - state management)
   - Local search: Done (regex-based)
   - Backend: Not started
   - Connection: Not done

2. **PDF Support** (40% complete)
   - Upload: Done
   - Chunking: Done (`chunking.ts`)
   - Embedding: Skeleton (`embeddings.ts` - expects external service)
   - UI integration: Not started
   - Database: Schema exists but unused

3. **Email System** (70% complete)
   - SES configuration: Done
   - Password reset: Done
   - Other use cases: Not implemented

### Abandoned/Low-Priority
- Social login (TODO comments but deprioritized)
- URL unfurling (`extract/route.ts` - DISABLED)
- Advanced export/import features

---

## 7. FEATURE DEPENDENCIES

```
Foundation (UUID v7) ✅
  └─→ Phase 1: Search 🔄
      ├─→ Fuzzy search (local)
      └─→ Semantic search (requires embeddings)
          └─→ Phase 2: RAG ❌
              ├─→ PDF chunking
              ├─→ LLM embeddings
              └─→ Chat with citations
                  └─→ Phase 3: Features ❌
                      ├─→ Quiz generation
                      ├─→ Flashcards
                      ├─→ Canvas integration
                      ├─→ Analytics
                      └─→ Calendar
```

**Critical Path Issues:**
- Phase 1 (search) MUST complete before Phase 2 (RAG) begins
- Phase 2 MUST complete before advanced features work
- Current velocity suggests Phase 1 could take 2-3 weeks (5 issues)
- Phase 2 could take 3-4 weeks (5 complex issues)
- Phase 3 is 4-6 weeks minimum (5 unrelated feature domains)

---

## 8. REALISTIC SCOPE FOR TEAM

### Given Team Size (3 people) & Current Velocity

**Realistic Timeline:**
- **Phase 1 (Search):** 2-3 weeks
  - Issues #21-25 are well-specified in `SEARCH_ARCHITECTURE_PLAN.md`
  - Requires: PostgreSQL full-text setup, API endpoint, UI integration, testing
  - Feasible with clear specs

- **Phase 2 (RAG):** 3-4 weeks
  - More complex: PDF handling, LLM integration, streaming chat
  - User API key management adds complexity
  - Issues #31-35 less well-specified than Phase 1

- **Phase 3 (Features):** Partial delivery only
  - Quiz + Flashcards: 2-3 weeks (tightly scoped)
  - Canvas integration: 1-2 weeks (OAuth + API)
  - Calendar/Analytics: 2-3 weeks each
  - **Recommendation:** Prioritize quiz + flashcards, defer Canvas/Analytics

### What Should Be Cut
1. **Canvas Integration** - Complex OAuth, minimal MVP value
2. **Analytics Dashboard** - Requires tracking infrastructure, can be v2
3. **Calendar Views** - Not core to learning experience
4. **Social Login** - Adds 1-2 weeks, can use email for MVP

### What Should Be Built
1. **Phase 1 (Search):** Critical for usability
2. **Phase 2 (RAG):** Core differentiator (AI-assisted learning)
3. **Quiz Generation:** High ROI feature (10-15 hours)
4. **Flashcard + SM-2:** High ROI feature (12-18 hours)

---

## 9. MISSING INFRASTRUCTURE

### For Search to Work
- [ ] PostgreSQL full-text search trigger setup
- [ ] Vector indexes (ivfflat) creation
- [ ] Search API endpoint implementation
- [ ] UI integration and hotkey binding

### For RAG to Work
- [ ] Embedding API integration (OpenAI or self-hosted)
- [ ] User API key management UI
- [ ] Chunking pipeline integration
- [ ] Chat state management
- [ ] Streaming response handler

### For Deployment
- [ ] Environment variable documentation (incomplete)
- [ ] Database migration guide for team (exists but incomplete)
- [ ] S3/MinIO setup guide
- [ ] LLM setup guide (when implementing Phase 2)

---

## 10. TECHNICAL DEBT & ISSUES

### Code Quality
- Mixed TypeScript/JavaScript (some files .ts, some .js)
- Stale TODO comments (social login, extract endpoint)
- Inconsistent error handling in legacy auth routes

### Database
- UUID v7 migration applied but not documented for team handoff
- pgvector installed but not actually used
- Database schema in both SQL files and code (schema.sql vs migration files)

### Frontend
- Command palette component exists but unintegrated
- Some components have stub implementations
- Search state exists but not connected to API

### Performance
- No mention of pagination limits in search API
- Index strategy not validated at scale (1000+ vectors mentioned in testing)
- No caching strategy for search results

---

## SUMMARY TABLE

| Feature | Status | Completeness | Dependencies | Risk |
|---------|--------|--------------|--------------|------|
| **Auth** | ✅ Complete | 100% | None | Low |
| **Notes CRUD** | ✅ Complete | 100% | Auth | Low |
| **Tree Organization** | ✅ Complete | 100% | Notes | Low |
| **File Upload** | ✅ Complete | 100% | Storage | Low |
| **Search** | 🔄 Active | 30% | Phase 1 spec | Medium |
| **Semantic Search** | ❌ Planned | 15% | Embeddings | High |
| **RAG Chat** | ❌ Planned | 5% | Phase 2 | High |
| **Quiz Generation** | ❌ Planned | 0% | RAG optional | Medium |
| **Flashcards + SM-2** | ❌ Planned | 0% | None | Low |
| **Canvas Integration** | ❌ Planned | 0% | OAuth lib | High |
| **Analytics** | ❌ Planned | 0% | Tracking | Medium |

---

## RECOMMENDATIONS

### For Immediate Next Steps (Next Sprint)
1. **Complete Phase 1 Search** (Issues #21-25)
   - Create PostgreSQL full-text search setup migration
   - Implement `/api/search` endpoint
   - Connect command palette to API
   - Add load testing with 100+ vectors (not 1000+ yet)

2. **Start Phase 2 Design** (No code)
   - Finalize LLM provider choice (OpenAI, Anthropic, self-hosted?)
   - Design user API key management UI
   - Plan PDF extraction pipeline
   - Design chat state model

### For Team Handoff
- [ ] Complete `MIGRATION_GUIDE.md` with step-by-step DB setup
- [ ] Document search endpoint in OpenAPI/Swagger format
- [ ] Create architecture diagram (current is text-based)
- [ ] Add integration tests for Phase 1 search

### For Scope Management
- **Keep:** Auth, Notes, Search, RAG, Quiz, Flashcards
- **Defer:** Canvas, Analytics, Calendar, Social login
- **Total realistic effort:** 8-10 weeks for what's planned, 4-5 weeks for MVP

