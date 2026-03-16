# OghmaNotes Storage Architecture - Complete Findings Index

## Overview

This directory contains comprehensive documentation of OghmaNotes' file storage architecture, including how binary files are stored, where metadata lives, how files are uploaded and served, S3 configuration, file path generation, and the storage service abstraction.

---

## Documents in This Set

### 1. STORAGE_FINDINGS_SUMMARY.md (Start Here!)
**Best for:** Executive overview, quick understanding of the system

Contains:
- Key findings at a glance
- Storage services overview (AWS S3 + PostgreSQL)
- File upload/retrieval flows
- Hybrid backend issues and future plans
- Security implementation
- Configuration details
- Database tables summary
- Critical security notes

**Length:** ~10KB | **Read time:** 5-10 minutes

---

### 2. STORAGE_FINDINGS_QUICK_REF.md
**Best for:** Quick lookup, visual diagrams, flow charts

Contains:
- Architecture diagram (ASCII)
- Current storage distribution table
- File upload flow (step-by-step)
- File retrieval flow (step-by-step)
- API endpoints with examples
- Storage provider abstraction
- Environment variables reference
- Key file locations
- Data type constraints
- Security checklist
- Future roadmap phases
- Performance considerations

**Length:** ~13KB | **Read time:** 10-15 minutes

---

### 3. STORAGE_FINDINGS_DETAILED.md
**Best for:** Deep technical understanding, implementation details

Contains:
- 13 comprehensive sections:
  1. Binary File Storage (S3 config, paths, provider)
  2. Metadata Storage (PostgreSQL schema, indexes)
  3. File Upload Handling (endpoint details, flow)
  4. Storage Service Abstraction (pattern, init, utilities)
  5. Notes Storage (hybrid backend, sync mechanism)
  6. PDF Annotations (storage in PostgreSQL)
  7. File Path/URL Generation (presigned URLs)
  8. Future Architecture (PostgreSQL-primary plan)
  9. Dependencies (npm packages used)
  10. Security Considerations (auth, validation, protection)
  11. File Storage Flow Diagram (visual flow)
  12. Current Data Redundancy (dual backend issue)
  13. Mock Storage (development)

- Summary tables
- File locations with relative paths
- Code examples
- Database schema DDL

**Length:** ~18KB | **Read time:** 20-30 minutes

---

### 4. STORAGE_FINDINGS_MANIFEST.txt
**Best for:** Reference, absolute paths, configuration lookup

Contains:
- Absolute file paths (all project files)
- Storage configuration files
- Storage provider implementation files
- Upload API location
- Notes storage locations
- Sync & migration files
- Database schema files
- Documentation references
- Dependencies list
- Database tables summary
- S3 bucket structure
- API endpoints (all)
- Configuration variables (all)
- Key findings summary

**Length:** ~15KB | **Read time:** 15-20 minutes (reference)

---

## Quick Navigation

### I want to understand...

**"How do files get uploaded?"**
→ See: `STORAGE_FINDINGS_QUICK_REF.md` → "File Upload Flow"

**"Where are files stored?"**
→ See: `STORAGE_FINDINGS_SUMMARY.md` → "What's Stored Where"

**"How do I access S3 files?"**
→ See: `STORAGE_FINDINGS_DETAILED.md` → "Section 7: File Path/URL Generation"

**"What database tables exist?"**
→ See: `STORAGE_FINDINGS_MANIFEST.txt` → "Section 9: Database Tables Summary"

**"What are the API endpoints?"**
→ See: `STORAGE_FINDINGS_QUICK_REF.md` → "API Endpoints"
→ Or: `STORAGE_FINDINGS_MANIFEST.txt` → "Section 11: API Endpoints"

**"What's the security model?"**
→ See: `STORAGE_FINDINGS_SUMMARY.md` → "Security Implementation"
→ Or: `STORAGE_FINDINGS_DETAILED.md` → "Section 10: Security Considerations"

**"What are the file locations?"**
→ See: `STORAGE_FINDINGS_MANIFEST.txt` (all absolute paths)

**"What's planned for the future?"**
→ See: `STORAGE_FINDINGS_SUMMARY.md` → "Future Architecture"
→ Or: `STORAGE_FINDINGS_DETAILED.md` → "Section 8: Future Architecture"

---

## Key Facts At A Glance

### Storage Services
- **S3:** AWS (eu-north-1), bucket: `our-chum-bucket`, prefix: `socsboard/`
- **Database:** PostgreSQL (AWS RDS), host: `oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com`

### File Upload
- Endpoint: `POST /api/upload`
- Authentication: JWT session required
- Path: `notes/{noteId}/{fileName}`
- Response: Presigned URL (1 hour expiry)

### File Retrieval
- Endpoint: `GET /api/upload?path={path}`
- Authentication: JWT session required
- Response: Presigned URL (1 hour expiry)

### Upload Constraints
- Max size: 100 MB
- Allowed types: md, pdf, jpg, jpeg, png, gif, zip, docx, doc, txt

### Database Tables
- `app.notes` - Note metadata (UUID, title, content, timestamps)
- `app.tree_items` - Folder hierarchy (UUID note_id, parent_id)
- `app.attachments` - File metadata (filename, s3_key, mime_type, processing status)
- `app.pdf_annotations` - PDF markup (JSONB annotation data)

### Security
- All operations require JWT authentication
- UUID validation prevents path traversal
- Presigned URLs expire after 24 hours
- User isolation via user_id checks in all queries
- Soft deletes preserve audit trail

### Current Issue (Being Fixed)
- Dual backend: Notes exist in BOTH S3 and PostgreSQL
- One-way sync: S3→PG migration in progress
- Future: PostgreSQL primary (single source of truth)

---

## File Structure

```
/home/semyon/code/university/ct216-software-eng/oghmanotes/

Configuration:
  .env                           # AWS S3 credentials (DO NOT COMMIT)
  .env.example                   # Template

Storage Implementation:
  src/lib/storage/
    ├── base.ts                 # Abstract StoreProvider
    ├── s3.ts                   # AWS S3 implementation
    ├── init.ts                 # Singleton initialization
    ├── str.ts                  # String/Buffer utilities
    ├── utils.ts                # Stream utilities
    └── index.ts                # Exports

Upload API:
  src/app/api/upload/route.ts   # POST/GET upload endpoints

Notes Storage:
  src/lib/notes/storage/
    ├── s3-storage.ts           # S3 operations (legacy)
    ├── pg-tree.js              # PostgreSQL tree operations
    ├── pdf-annotations.js      # PDF markup in PostgreSQL
    └── mock-storage.ts         # Development mock data

Sync & Migration:
  src/app/api/notes/sync-s3/route.ts           # Sync API
  src/lib/notes/migrations/sync-s3-to-pg.js    # Sync logic

Database:
  database/migrations/
    ├── 001_create_notes_table.sql
    ├── 002_add_tree_and_vectors.sql
    └── 00X_uuid*.sql           # UUID migration scripts

Documentation:
  STORAGE_FINDINGS_INDEX.md          # This file
  STORAGE_FINDINGS_SUMMARY.md        # Executive summary
  STORAGE_FINDINGS_QUICK_REF.md      # Quick reference with diagrams
  STORAGE_FINDINGS_DETAILED.md       # Detailed technical analysis
  STORAGE_FINDINGS_MANIFEST.txt      # Absolute path reference
  STORAGE_ARCHITECTURE.md            # 603-line migration plan (existing)
```

---

## How to Use This Documentation

### Recommended Reading Order

1. **Start:** `STORAGE_FINDINGS_SUMMARY.md` (5-10 min overview)
2. **Visualize:** `STORAGE_FINDINGS_QUICK_REF.md` (10-15 min with diagrams)
3. **Deep Dive:** `STORAGE_FINDINGS_DETAILED.md` (20-30 min technical details)
4. **Reference:** `STORAGE_FINDINGS_MANIFEST.txt` (as needed for paths)

### By Use Case

**Adding a new file upload feature:**
→ Read: Quick Ref → Section "File Upload Flow"
→ Reference: Manifest → Section "3. Upload & File Retrieval API"

**Implementing OCR pipeline:**
→ Read: Summary → Section "Future Architecture"
→ Deep Dive: Detailed → Section "8. Future Architecture"
→ Reference: Existing file at `/STORAGE_ARCHITECTURE.md`

**Troubleshooting file access issues:**
→ Read: Quick Ref → Section "API Endpoints"
→ Deep Dive: Detailed → Section "7. File Path/URL Generation"
→ Check: Security checklist in Quick Ref

**Migrating to PostgreSQL primary:**
→ Read: `/STORAGE_ARCHITECTURE.md` (main reference)
→ Reference: Detailed → Section "8. Future Architecture"

---

## Key Code Locations

### Storage Initialization
```typescript
// Get singleton storage provider
import { getStorageProvider } from '@/lib/storage/init'
const storage = getStorageProvider()
```

### File Upload
```typescript
// POST /api/upload
// Location: src/app/api/upload/route.ts
const storage = getStorageProvider()
await storage.putObject(storagePath, Buffer.from(buffer))
const signedUrl = await storage.getSignUrl(storagePath, 3600)
```

### File Retrieval
```typescript
// GET /api/upload?path={path}
// Location: src/app/api/upload/route.ts
const exists = await storage.hasObject(path)
const url = await storage.getSignUrl(path, 3600)
```

### Database Queries
```javascript
// PostgreSQL tree operations
// Location: src/lib/notes/storage/pg-tree.js
import sql from '@/database/pgsql.js'
const tree = await getTreeFromPG(userId)
```

### PDF Annotations
```javascript
// Save PDF highlights/markup
// Location: src/lib/notes/storage/pdf-annotations.js
await saveAnnotations(userId, noteId, attachmentId, annotationData)
```

---

## Configuration Reference

### Environment Variables
```bash
# S3 Storage
STORAGE_BUCKET=our-chum-bucket
STORAGE_REGION=eu-north-1
STORAGE_ENDPOINT=https://s3.eu-north-1.amazonaws.com
STORAGE_ACCESS_KEY=AKIA...
STORAGE_SECRET_KEY=...
STORAGE_PREFIX=socsboard
STORAGE_PATH_STYLE=false

# File Upload
MAX_FILE_SIZE=104857600         # 100 MB
ALLOWED_FILE_TYPES=md,pdf,...  
PRESIGNED_URL_EXPIRY=86400      # 24 hours

# Database
DATABASE_URL=postgresql://...
```

---

## Security Checklist

- [x] Authentication: All endpoints require JWT session
- [x] Authorization: User isolation via user_id
- [x] File Validation: UUID validation, MIME type check, size limit
- [x] Path Security: UUID prevents directory traversal
- [x] URL Security: Presigned URLs expire
- [x] Soft Deletes: deleted_at preserves audit trail

---

## Future Migrations

**Planned (from STORAGE_ARCHITECTURE.md):**
1. PostgreSQL becomes single source of truth
2. S3 stores binary files only
3. BullMQ OCR pipeline for document processing
4. pgvector embeddings for semantic search
5. Full-text search on PostgreSQL

---

## Questions?

- **Understanding the architecture?** Start with STORAGE_FINDINGS_SUMMARY.md
- **Need visuals?** See STORAGE_FINDINGS_QUICK_REF.md
- **Technical details?** Check STORAGE_FINDINGS_DETAILED.md
- **File paths/config?** Reference STORAGE_FINDINGS_MANIFEST.txt
- **Migration planning?** Read STORAGE_ARCHITECTURE.md (existing in repo)

---

**Created:** March 16, 2026
**Project:** OghmaNotes (Next.js 16 + React 19 + PostgreSQL + AWS S3)
**Current Status:** Hybrid storage architecture in transition to PostgreSQL-primary
**AWS Region:** eu-north-1 (Ireland)
**Database:** PostgreSQL 15+ with pgvector support (planned)
