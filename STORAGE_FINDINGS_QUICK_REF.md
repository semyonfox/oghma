# OghmaNotes Storage - Quick Reference Guide

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│           OghmaNotes Storage Architecture           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CLIENT (Browser)                                  │
│    │                                                │
│    ├─ POST /api/upload ──────────────────────────┐ │
│    │                                            │ │
│    └─ GET /api/upload?path=... ────────────────┘ │
│                                                  ↓ │
│  ┌──────────────────┐        ┌────────────────────┐│
│  │  PostgreSQL      │        │   AWS S3 (eu-n1)   ││
│  │  (Metadata)      │◄──────►│  (Binary Files)    ││
│  ├──────────────────┤        ├────────────────────┤│
│  │ - notes          │        │ socsboard/         ││
│  │ - tree_items     │        │  ├─ notes/         ││
│  │ - attachments    │        │  │  ├─ {noteId}/   ││
│  │ - pdf_annotations│        │  │  │  ├─ file.pdf ││
│  │ - users          │        │  │  │  └─ image.jpg││
│  │ - settings       │        │  │  ├─ index.json  ││
│  │                  │        │  │  └─ ocr-raw.txt ││
│  └──────────────────┘        │  ├─ tree.json      ││
│  Single Source of Truth      │  └─ settings.json  ││
│  (future target)             │  Presigned URLs    ││
│                              │  (24h expiry)      ││
│                              └────────────────────┘│
│                                                     │
│  Future: BullMQ + Redis                            │
│  ├─ OCR Processing                                 │
│  ├─ Embedding Generation                           │
│  └─ pgvector Vector Search                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Current Storage Distribution

### PostgreSQL (Metadata)
| Data | Table | Columns |
|------|-------|---------|
| Notes | `app.notes` | note_id, user_id, title, content, s3_key, created_at, updated_at, deleted_at, pinned, shared |
| Folder Tree | `app.tree_items` | id, user_id, note_id, parent_id, is_expanded, position, created_at, updated_at |
| File Metadata | `app.attachments` | id, note_id, user_id, filename, s3_key, mime_type, file_size, processing_status, ocr_job_id |
| PDF Markup | `app.pdf_annotations` | id, note_id, user_id, attachment_id, annotation_data, created_at, updated_at |
| User Settings | `app.login` + settings column | (future: migrate to app.notes or separate table) |

### AWS S3 (Binary Files)
```
our-chum-bucket/
├── socsboard/                          # Configured prefix
│   ├── notes/
│   │   ├── index.json                 # Master notes index (legacy)
│   │   ├── {noteId}/
│   │   │   ├── note.json              # Individual note (legacy)
│   │   │   ├── attachment-1.pdf       # User uploads
│   │   │   ├── image.jpg              # User uploads
│   │   │   └── ocr-raw-*.txt          # Raw OCR output
│   ├── tree/
│   │   └── tree.json                  # Folder hierarchy (legacy)
│   └── settings/
│       └── {userId}/
│           └── settings.json          # User config (legacy)
```

## File Upload Flow

```
User clicks "Upload File"
         ↓
POST /api/upload
├─ validateSession() ──→ 401 if not auth'd
├─ Validate UUID noteId ──→ 400 if invalid
├─ Check file exists ──→ 400 if missing
         ↓
getStorageProvider().putObject()
├─ S3Client.send(PutObjectCommand)
├─ Path: notes/{noteId}/{fileName}
├─ Full path with prefix: socsboard/notes/{noteId}/{fileName}
         ↓
AWS S3 Bucket
├─ File stored
├─ Metadata saved
         ↓
getStorageProvider().getSignUrl()
├─ Creates presigned URL
├─ Valid for 3600 seconds (1 hour)
├─ Uses AWS SDK v3 getSignedUrl()
         ↓
Return to Client
├─ { success: true, fileName, path, url, size, type }
         ↓
Client displays file preview via signed URL
```

## File Retrieval Flow

```
User clicks "Download File" or needs preview
         ↓
GET /api/upload?path=notes/{noteId}/file.pdf
├─ validateSession() ──→ 401 if not auth'd
├─ Validate path parameter ──→ 400 if missing
         ↓
getStorageProvider().hasObject()
├─ S3Client.send(HeadObjectCommand)
├─ Returns: true/false
         ↓
getStorageProvider().getSignUrl()
├─ Creates presigned URL
├─ Valid for 3600 seconds (1 hour)
         ↓
Return to Client
├─ { success: true, path, url }
         ↓
Client uses URL to fetch file from S3
```

## API Endpoints

### File Upload
```
POST /api/upload
Content-Type: multipart/form-data

Request:
{
  "file": <File>,
  "noteId": "550e8400-e29b-41d4-a716-446655440000"
}

Response (200):
{
  "success": true,
  "fileName": "document.pdf",
  "path": "notes/550e8400-e29b-41d4-a716-446655440000/document.pdf",
  "url": "https://s3.eu-north-1.amazonaws.com/our-chum-bucket/socsboard/...",
  "size": 1024000,
  "type": "application/pdf"
}

Errors:
401 - Unauthorized
400 - Invalid noteId or missing file
500 - Upload failed
```

### File Retrieval
```
GET /api/upload?path=notes/{noteId}/{fileName}

Response (200):
{
  "success": true,
  "path": "notes/{noteId}/{fileName}",
  "url": "https://s3.eu-north-1.amazonaws.com/..."
}

Errors:
401 - Unauthorized
400 - Missing path parameter
404 - File not found
500 - Retrieval failed
```

### Sync Status
```
GET /api/notes/sync-s3

Response:
{
  "success": true,
  "totalInS3": 42,
  "totalInPG": 35,
  "missingInPG": 7,
  "missingNoteIds": [
    { "id": "uuid", "title": "Note Title" },
    ...
  ]
}
```

### Perform Sync
```
POST /api/notes/sync-s3

Response:
{
  "success": true,
  "totalInS3": 42,
  "synced": 7,
  "alreadyInPG": 35,
  "failed": 0,
  "errors": [],
  "message": "Sync complete: 7 notes synced, 35 already in database, 0 failed"
}
```

## Storage Provider Abstraction

### Base Class: StoreProvider
```typescript
// Abstract methods all storage providers must implement:

getSignUrl(path: string, expiresIn?: number)
  ↓ Returns: presigned URL valid for expiresIn seconds

hasObject(path: string)
  ↓ Returns: true if file exists, false otherwise

getObject(path: string, isCompressed?: boolean)
  ↓ Returns: file content as string (or undefined if not found)

putObject(path: string, raw: Buffer | string, options?, isCompressed?)
  ↓ Stores file at path with optional metadata/headers

deleteObject(path: string)
  ↓ Removes file from storage

copyObject(fromPath: string, toPath: string, options)
  ↓ Duplicates file with optional metadata update
```

### Implementation: StoreS3
```typescript
// Concrete AWS S3 implementation via AWS SDK v3

const storage = getStorageProvider()  // Singleton instance
// Returns: StoreS3 configured from environment variables
```

## Configuration Files

### Environment Variables
```bash
# S3 Connection
STORAGE_BUCKET=our-chum-bucket
STORAGE_REGION=eu-north-1
STORAGE_ENDPOINT=https://s3.eu-north-1.amazonaws.com
STORAGE_PATH_STYLE=false
STORAGE_PREFIX=socsboard

# Credentials (optional - can use IAM role)
STORAGE_ACCESS_KEY=AKIA...
STORAGE_SECRET_KEY=...

# File Upload
MAX_FILE_SIZE=104857600              # 100 MB
ALLOWED_FILE_TYPES=md,pdf,jpg,jpeg,png,gif,zip,docx,doc,txt
PRESIGNED_URL_EXPIRY=86400           # 24 hours

# Database
DATABASE_URL=postgresql://...
DATABASE_HOST=oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com
DATABASE_PORT=5432
```

## Key File Locations

```
/src/lib/storage/
├── base.ts               # Abstract StoreProvider class
├── s3.ts                 # AWS S3 implementation (StoreS3)
├── init.ts               # Singleton initialization
├── str.ts                # String/Buffer/JSON utilities + compression
├── utils.ts              # Stream utilities
├── logger.ts             # Logging utilities
└── index.ts              # Exports

/src/app/api/
└── upload/route.ts       # POST/GET upload and retrieval endpoints

/src/lib/notes/storage/
├── s3-storage.ts         # S3-backed note CRUD (legacy)
├── pg-tree.js            # PostgreSQL tree operations
├── pdf-annotations.js    # PDF markup storage
└── mock-storage.ts       # Development mock data

/src/lib/notes/migrations/
└── sync-s3-to-pg.js      # S3→PostgreSQL sync logic

/database/migrations/
├── 001_create_notes_table.sql
├── 002_add_tree_and_vectors.sql
└── 00X_uuid*.sql         # UUID schema updates

/.env                     # AWS S3 credentials (DO NOT COMMIT)
/.env.example             # Template (safe to commit)
```

## Data Type Constraints

### File Upload
```
Field       | Type      | Constraint
------------|-----------|------------------------------------
noteId      | string    | Valid UUID format required
file        | File      | Required, max 100 MB
filename    | string    | Extracted from file.name
MIME type   | string    | Checked against allowed list
file size   | number    | Must be ≤ 104,857,600 bytes (100 MB)
```

### Database Fields
```
Column              | Type        | Purpose
--------------------|-------------|----------------------------------
note_id            | UUID        | Primary key, note identifier
user_id            | UUID        | Foreign key to users table
title              | VARCHAR     | Note title (searchable)
content            | TEXT        | Note content (Markdown/HTML)
s3_key             | TEXT        | Path in S3 bucket
deleted            | SMALLINT    | 0=active, 1=soft-deleted
deleted_at         | TIMESTAMPTZ | Soft delete timestamp
created_at         | TIMESTAMPTZ | Creation time
updated_at         | TIMESTAMPTZ | Last modification time
pinned             | SMALLINT    | 0=unpinned, 1=pinned
shared             | SMALLINT    | 0=private, 1=public
```

## Security Checklist

- [ ] **Authentication**: All endpoints require valid JWT session
- [ ] **Authorization**: Users can only access their own notes/files
- [ ] **File Validation**: Check MIME type, file size, extension
- [ ] **Path Traversal**: UUID validation prevents directory traversal
- [ ] **Presigned URLs**: Expire after 24 hours
- [ ] **S3 Credentials**: Use IAM roles in production (not hardcoded)
- [ ] **Soft Deletes**: deleted_at preserves audit trail
- [ ] **User Isolation**: user_id checks on all database queries

## Future Roadmap

### Phase 1: Current State
- Notes in S3 + PostgreSQL (dual storage)
- Tree in S3 + PostgreSQL (dual storage)
- Settings in S3 (legacy)
- One-way sync S3→PG

### Phase 2: PostgreSQL Primary
- Move notes content to PostgreSQL
- Move tree structure to PostgreSQL
- Move settings to PostgreSQL
- Remove S3-based storage

### Phase 3: OCR Pipeline
- BullMQ job queue
- Tesseract OCR worker
- Extract text from PDFs/images
- Generate embeddings (pgvector)

### Phase 4: Search Enhancement
- Full-text search (FTS) on PostgreSQL
- Semantic search via embeddings
- Vector similarity (HNSW index)

### Phase 5: RAG Integration
- Retrieval-augmented generation
- LLM context from retrieved notes
- Semantic note linking

## Performance Considerations

### S3 Operations
- **Presigned URL expiry**: 24 hours (configurable)
- **AWS SDK**: v3 with credentials from environment
- **Path prefix**: `socsboard/` applies to all paths
- **Error handling**: Graceful degradation for NoSuchKey errors

### PostgreSQL Queries
- **Indexes**: On user_id, parent_id, created_at, deleted_at
- **Tree queries**: O(n) traversal (can optimize with adjacency list)
- **FTS indexes**: GIN indexes on tsvector columns (future)
- **Vector indexes**: HNSW indexes for embedding search (future)

### File Upload
- **Max size**: 100 MB per file
- **Async processing**: Future BullMQ for OCR (not yet implemented)
- **Progress tracking**: Return immediate response with signed URL

---

Created: 2025-03-16
Covers: OghmaNotes v1.0 (Next.js 16 + React 19 + PostgreSQL + AWS S3)
