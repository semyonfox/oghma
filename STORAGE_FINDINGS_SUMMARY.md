# OghmaNotes File Storage Architecture - Exploration Complete

## Executive Summary

I've conducted a comprehensive exploration of OghmaNotes' file storage architecture. Here's what I found:

---

## Key Findings

### 1. Storage Services

**AWS S3** (`eu-north-1` region)
- Bucket: `our-chum-bucket`
- Prefix: `socsboard/`
- Purpose: Binary files (PDFs, images, videos, attachments)
- Presigned URLs: 24-hour expiry (configurable)
- Implementation: AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)

**PostgreSQL** (AWS RDS)
- Host: `oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com`
- Purpose: Note metadata, tree structure, user data, PDF annotations
- Supports pgvector extension (for future embeddings)

### 2. Metadata Storage

**Primary Tables:**
- `app.notes` - Note metadata (title, content, timestamps, flags)
- `app.tree_items` - Folder hierarchy structure
- `app.attachments` - File metadata (filename, S3 path, size, processing status)
- `app.pdf_annotations` - PDF markup (highlights, notes) stored as JSONB

### 3. File Upload Flow

```
POST /api/upload
├─ Validate session (JWT)
├─ Validate noteId (UUID)
├─ Check file exists
└─ Upload to S3: notes/{noteId}/{fileName}
   └─ Generate presigned URL (1 hour)
   └─ Return { success, fileName, path, url, size, type }
```

### 4. File Retrieval Flow

```
GET /api/upload?path={storagePath}
├─ Validate session
├─ Check file exists (HeadObject)
└─ Generate presigned URL
   └─ Return { success, path, url }
```

### 5. Storage Service Abstraction

**Architecture Pattern:**
- Base class: `StoreProvider` (abstract interface)
- Implementation: `StoreS3` (AWS S3 concrete class)
- Singleton: `getStorageProvider()` returns global instance
- Supports: AWS S3, MinIO, S3-compatible endpoints

**Key Methods:**
- `getSignUrl(path, expiresIn?)` - Generate presigned URLs
- `putObject(path, raw, options?)` - Upload file
- `getObject(path)` - Download file
- `hasObject(path)` - Check existence
- `deleteObject(path)` - Remove file
- `copyObject(fromPath, toPath, options)` - Duplicate file

### 6. S3 Storage Layout

```
socsboard/
├── notes/
│   ├── index.json                    (legacy - master notes index)
│   └── {noteId}/
│       ├── note.json                 (legacy - individual note)
│       ├── {filename}.pdf            (user uploads)
│       ├── {filename}.jpg            (user uploads)
│       └── ocr-raw-{timestamp}.txt   (future - raw OCR output)
├── tree/
│   └── tree.json                     (legacy - folder hierarchy)
└── settings/
    └── {userId}/settings.json        (legacy - user config)
```

### 7. Hybrid Backend (Current Issue)

**Dual Storage Problem:**
- Notes exist in **S3** (index.json) AND **PostgreSQL** (app.notes table)
- Tree structure in **S3** (tree.json) AND **PostgreSQL** (app.tree_items)
- Settings in **S3** (legacy)
- One-way sync: S3→PG (incomplete, unreliable)

**Resolution:**
- Migration endpoint: `GET/POST /api/notes/sync-s3`
- Sync logic: `/src/lib/notes/migrations/sync-s3-to-pg.js`
- Plan: Move to PostgreSQL-primary architecture

### 8. Future Architecture (Planned)

**Phase 2: PostgreSQL Primary**
- Notes content, metadata, tree → PostgreSQL
- Settings → PostgreSQL
- S3 → Binary files only (PDFs, images, videos)

**Phase 3: OCR Pipeline**
- BullMQ job queue + Redis
- Tesseract OCR worker
- Extract text from PDFs/images
- Generate embeddings (pgvector, OpenAI)

**Phase 4: Enhanced Search**
- Full-text search (PostgreSQL tsvector)
- Semantic search (pgvector embeddings)
- Vector similarity (HNSW index)

### 9. File Location Summary

**Configuration:**
- `/home/semyon/code/university/ct216-software-eng/oghmanotes/.env` - AWS credentials
- `/home/semyon/code/university/ct216-software-eng/oghmanotes/.env.example` - Template

**Storage Implementation:**
- `/src/lib/storage/` - Core storage abstraction
  - `s3.ts` - AWS S3 implementation
  - `base.ts` - Abstract base class
  - `init.ts` - Singleton initialization
  - `str.ts` - String/Buffer utilities
  - `utils.ts` - Stream utilities

**Upload API:**
- `/src/app/api/upload/route.ts` - POST/GET endpoints

**Notes Storage:**
- `/src/lib/notes/storage/s3-storage.ts` - S3 operations (legacy)
- `/src/lib/notes/storage/pg-tree.js` - PostgreSQL tree operations
- `/src/lib/notes/storage/pdf-annotations.js` - PDF markup

**Sync & Migration:**
- `/src/app/api/notes/sync-s3/route.ts` - API endpoints
- `/src/lib/notes/migrations/sync-s3-to-pg.js` - Sync logic

**Database:**
- `/database/migrations/001_create_notes_table.sql` - Initial schema
- `/database/migrations/002_add_tree_and_vectors.sql` - Tree & attachments
- `/STORAGE_ARCHITECTURE.md` - 603-line migration plan

### 10. Security Implementation

- **Authentication:** All endpoints require JWT session validation
- **Authorization:** User isolation via user_id checks
- **File Validation:** UUID validation (prevents path traversal), MIME type check, 100MB limit
- **URL Security:** Presigned URLs expire after 24 hours
- **Audit Trail:** Soft deletes (deleted_at timestamp) preserve history

---

## Configuration Details

### Environment Variables (from `.env`)
```
# S3 Storage
STORAGE_BUCKET=our-chum-bucket
STORAGE_REGION=eu-north-1
STORAGE_ENDPOINT=https://s3.eu-north-1.amazonaws.com
STORAGE_PREFIX=socsboard
STORAGE_PATH_STYLE=false

# File Upload
MAX_FILE_SIZE=104857600 (100 MB)
ALLOWED_FILE_TYPES=md,pdf,jpg,jpeg,png,gif,zip,docx,doc,txt
PRESIGNED_URL_EXPIRY=86400 (24 hours)

# Database
DATABASE_URL=postgresql://oghma_app:***@oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com:5432/oghma
DATABASE_HOST=oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com
DATABASE_PORT=5432
```

### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `app.notes` | Note metadata | note_id (UUID), user_id, title, content, s3_key, deleted_at, created_at, updated_at |
| `app.tree_items` | Folder hierarchy | id, user_id, note_id, parent_id, is_expanded, position |
| `app.attachments` | File metadata | id, note_id, user_id, filename, s3_key, mime_type, file_size, ocr_job_id |
| `app.pdf_annotations` | PDF markup | id, note_id, user_id, attachment_id, annotation_data (JSONB) |

### Dependencies

```json
{
  "@aws-sdk/client-s3": "^3.1009.0",
  "@aws-sdk/s3-request-presigner": "^3.1009.0",
  "minio": "^8.0.7",
  "pdf-parse": "^2.4.5",
  "pg": "^8.20.0",
  "postgres": "^3.4.8"
}
```

---

## API Endpoints

### File Upload
```
POST /api/upload
Request: FormData { file: File, noteId: UUID }
Response: { success, fileName, path, url, size, type }
Errors: 401 (unauthorized), 400 (invalid), 500 (failed)
```

### File Retrieval
```
GET /api/upload?path={storagePath}
Response: { success, path, url }
Errors: 401, 400, 404 (not found), 500
```

### Sync Status
```
GET /api/notes/sync-s3
Response: { success, totalInS3, totalInPG, missingInPG, missingNoteIds }
```

### Perform Sync
```
POST /api/notes/sync-s3
Response: { success, totalInS3, synced, alreadyInPG, failed, errors, message }
```

---

## What's Stored Where

### S3 Stores:
- PDFs, images, videos (user attachments)
- Notes content (legacy - being migrated)
- Tree structure (legacy - being migrated)
- Settings (legacy - being migrated)
- Raw OCR output (future audit trail)

### PostgreSQL Stores:
- Note metadata (UUID, user_id, title, timestamps)
- Tree structure (folder hierarchy)
- Attachment file metadata
- PDF annotations (JSONB)
- User accounts and authentication
- Settings (being migrated here)

### Future (Planned):
- All note content → PostgreSQL
- All tree → PostgreSQL
- Extracted text → PostgreSQL
- Embeddings → PostgreSQL (pgvector)
- S3 → Binary files only

---

## Critical Security Notes

1. **Session Required:** All upload/download operations require valid JWT
2. **UUID Validation:** Prevents directory traversal attacks
3. **File Type Whitelist:** Only md, pdf, jpg, jpeg, png, gif, zip, docx, doc, txt
4. **Size Limit:** 100 MB per file
5. **Presigned URLs:** Expire after 24 hours (not accessible after expiry)
6. **User Isolation:** All queries filtered by user_id

---

## Documents Generated

I've created three comprehensive reference documents:

1. **STORAGE_ARCHITECTURE_REPORT.md** (detailed 13-section analysis)
   - Complete architecture overview
   - Database schema definitions
   - API endpoint specifications
   - Security considerations
   - Future roadmap

2. **STORAGE_QUICK_REFERENCE.md** (quick lookup guide)
   - Visual diagrams
   - Flow charts
   - API endpoints
   - Configuration checklists
   - Performance considerations

3. **STORAGE_FILE_MANIFEST.txt** (absolute path reference)
   - All file locations with absolute paths
   - Configuration variables
   - Database table details
   - S3 bucket structure
   - Dependencies

---

## Action Items (If Consolidating to PostgreSQL Primary)

1. Complete the S3→PG migration using existing sync endpoint
2. Implement BullMQ OCR pipeline for document processing
3. Add pgvector columns to app.notes for embeddings
4. Create FTS indexes on PostgreSQL
5. Remove legacy S3-based note/tree/settings storage
6. Add HNSW vector indexes for semantic search
7. Implement dual search (FTS + semantic)

---

## Conclusion

OghmaNotes uses a **hybrid storage architecture** with AWS S3 for binary files and PostgreSQL for metadata. The system is in **transition** between a dual-backend approach (where data duplicates in both S3 and PostgreSQL) and a planned PostgreSQL-primary architecture. File uploads are secure, authenticated, and handled via presigned URLs with 24-hour expiry. The codebase includes a one-way sync mechanism (S3→PG) indicating an active migration path toward consolidating PostgreSQL as the single source of truth.

---

Generated: March 16, 2026
Project: OghmaNotes (Next.js 16 + React 19 + PostgreSQL + AWS S3)
