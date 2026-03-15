# OghmaNotes Storage Consolidation - Executive Summary

## What's Being Done

You're consolidating OghmaNotes from a **messy dual-storage architecture** to a **clean, scalable system** designed for OCR, RAG, and semantic search.

### The Problem (Current State)
- Notes stored in **both PostgreSQL AND S3** ❌
- Tree structure in **both backends** ❌
- One-way sync (S3→PG) **incomplete & unreliable** ❌
- No clear **source of truth** ❌
- **Complex debugging**, sync conflicts, data inconsistency ❌
- Dead code: Prisma installed but unused ❌
- Security issues: upload endpoint unauthenticated ❌

### The Solution (Target State)
- **PostgreSQL = Master** (all data, metadata, structure) ✅
- **S3 = Asset Storage** (binaries + audit trail only) ✅
- **BullMQ Queue** for async OCR/embedding processing ✅
- **No sync complexity** ✅
- **Searchable text** (stopword-filtered, processed) ✅
- **Semantic search ready** (pgvector embeddings) ✅
- **RAG pipeline ready** (context retrieval from notes) ✅
- Single auth system (next-auth only) ✅

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    USER UPLOADS PDF/IMAGE                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    POST /api/upload
                    (authenticated)
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    S3 Storage      DB Record          BullMQ Job
    (binary)        (metadata)         (async ocr)
                           │                  │
                           │          ┌────────┘
                           │          │
                           │          ▼
                    ┌──────────────────────────┐
                    │  Worker (Background)     │
                    │                          │
                    │  • OCR (Tesseract)       │
                    │  • Text processing       │
                    │  • Embeddings (OpenAI)   │
                    │  • DB updates            │
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
            PostgreSQL Updates         S3 Audit Trail
            (extracted_text_       (raw OCR output)
             processed,
             embedding)
                    │
        ┌───────────┼────────────┐
        │           │            │
        ▼           ▼            ▼
    FTS Search  Semantic      RAG
    (keyword)   (vectors)    (context)
```

---

## Storage Distribution

| What | Where | Why |
|------|-------|-----|
| Note metadata | PostgreSQL | Indexed queries, consistency |
| Note content (Markdown) | PostgreSQL | Full-text search, edit history |
| Tree structure | PostgreSQL | Single source of truth |
| Extracted text (cleaned) | PostgreSQL | Searchable, processed |
| Embeddings (1536-dim) | PostgreSQL (pgvector) | Semantic search + RAG |
| **Binary files** | **S3** | **Large, CDN-friendly** |
| **Raw OCR output** | **S3** | **Audit trail, pre-processing** |

---

## 5-Week Implementation Plan

### Week 1: Schema & Cleanup
- Add new columns to PostgreSQL (processing pipeline fields)
- Create FTS + vector indexes
- Remove Prisma (dead code)
- Consolidate auth (next-auth only)
- Fix auth issues (upload endpoint, email linking)

**Effort:** 8 hours  
**Deliverable:** Clean schema, working build

### Week 2-3: API Refactor
- Update `/api/upload` → authenticates, enqueues OCR
- Implement `/api/search` → FTS + semantic
- Implement `/api/notes/{id}/processing-status` → UI progress
- Remove all S3 calls from note CRUD
- Consolidate tree to PostgreSQL only

**Effort:** 20 hours  
**Deliverable:** All CRUD + search working

### Week 3-4: BullMQ & OCR Pipeline
- Install Redis + BullMQ
- Implement OCR worker (Tesseract + text processing)
- Add embedding generation (OpenAI)
- Set up job monitoring
- Test with sample PDFs

**Effort:** 16 hours  
**Deliverable:** OCR pipeline working end-to-end

### Week 4-5: Data Migration
- Build one-time migration script
- Test in staging
- Run on production
- Verify no data loss
- Monitor for errors

**Effort:** 12 hours  
**Deliverable:** All data migrated, verified

### Week 5: Cleanup & Testing
- Delete S3 sync code
- Full regression testing
- Update documentation
- Archive old S3 data

**Effort:** 12 hours  
**Deliverable:** Production-ready system

**Total: ~4-5 weeks, 68 hours**

---

## Key Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Job Queue | **BullMQ** + Redis | Async OCR/embedding |
| OCR | **Tesseract.js** | Extract text from PDFs/images |
| Text Processing | **stopword** lib | Remove stop words |
| Embeddings | **OpenAI** API | Generate semantic vectors |
| Vector Search | **pgvector** + HNSW | Fast similarity search |
| Full-Text Search | **PostgreSQL** tsvector | Keyword search |
| Database | **PostgreSQL** 15+ | Single source of truth |
| File Storage | **S3/MinIO** | Binary assets only |

---

## What Gets Fixed

### Architecture Issues
✅ **Dual storage** → single source of truth (PostgreSQL)  
✅ **Sync complexity** → removed (no more S3↔PG sync)  
✅ **Data inconsistency** → transactional consistency  

### Security Issues
✅ **Unauthenticated upload** → adds auth check  
✅ **Dangerous email linking** → removes config  
✅ **Missing validation** → validates all inputs  

### Code Quality Issues
✅ **Prisma unused** → removed  
✅ **Dual auth** → single next-auth  
✅ **Legacy code** → cleaned up  
✅ **ESLint errors** → fixed  

### New Capabilities
✅ **OCR pipeline** → async processing with retries  
✅ **Text search** → full-text search on extracted text  
✅ **Semantic search** → vector similarity search  
✅ **RAG ready** → embeddings + context retrieval  
✅ **Progress tracking** → UI shows OCR status  

---

## Files Created for You

1. **`STORAGE_ARCHITECTURE.md`** - Complete technical spec
   - Schema design
   - API endpoints
   - Data flow diagrams
   - BullMQ worker code

2. **`docs/STORAGE_ARCHITECTURE_VISUAL.html`** - Visual diagram
   - Architecture overview
   - Component grid
   - Timeline visualization
   - Comparison before/after

3. **`IMPLEMENTATION_CHECKLIST.md`** - Step-by-step checklist
   - All 5 phases broken down
   - Exact SQL migrations
   - Testing procedures
   - Rollback plan

4. **`docs/IMPLEMENTATION_QUICK_START.md`** - Copy-paste code
   - Database migration
   - Worker setup
   - Upload endpoint update
   - Environment variables

5. **`CONSOLIDATION_SUMMARY.md`** - This file

---

## Getting Started

### Today (Phase 1 - Week 1)
1. Read `STORAGE_ARCHITECTURE.md` completely
2. View `docs/STORAGE_ARCHITECTURE_VISUAL.html` in browser
3. Start with database migration (copy SQL from `IMPLEMENTATION_QUICK_START.md`)
4. Install dependencies: `npm uninstall prisma @prisma/client && npm install bullmq redis stopword tesseract.js openai`
5. Run migrations: `npm run db:migrate`

### This Week
6. Consolidate auth (remove custom JWT)
7. Fix upload endpoint auth
8. Create OCR worker files (copy from quick-start)
9. Test queue setup

### Next Week
10. Implement search endpoint
11. Implement processing-status endpoint
12. Test full upload → OCR → search flow

See `IMPLEMENTATION_CHECKLIST.md` for detailed week-by-week breakdown.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Data loss during migration | Low | Backup before migration, test in staging |
| OCR worker failures | Low | 3x retry with exponential backoff |
| Performance impact | Medium | Index strategy well-planned, tested |
| User-facing downtime | Low | Can migrate data in background |

---

## Success Criteria

After completion, you'll have:

✅ Single source of truth (PostgreSQL master)  
✅ No sync complexity (S3 for assets only)  
✅ Authenticated uploads  
✅ OCR pipeline working (async, retries)  
✅ FTS + semantic search  
✅ RAG-ready (embeddings available)  
✅ Clean codebase (no dead code)  
✅ All tests passing  
✅ Zero data loss  
✅ Better performance (single DB queries)  

---

## Questions?

Refer to:
- **Architecture questions** → `STORAGE_ARCHITECTURE.md`
- **Implementation questions** → `IMPLEMENTATION_CHECKLIST.md`
- **Code examples** → `docs/IMPLEMENTATION_QUICK_START.md`
- **Visual overview** → `docs/STORAGE_ARCHITECTURE_VISUAL.html`

---

## Next Action

1. Open `STORAGE_ARCHITECTURE.md` and read the "Database Schema" section
2. Open `docs/STORAGE_ARCHITECTURE_VISUAL.html` in your browser
3. Review the database migration in `docs/IMPLEMENTATION_QUICK_START.md`
4. Create the migration file and run it
5. Start Phase 1 checklist

**Estimated time to completion:** 4-5 weeks  
**Effort:** ~68 hours total  
**Impact:** Solves architectural debt, enables OCR/RAG pipeline  

Good luck! 🚀
