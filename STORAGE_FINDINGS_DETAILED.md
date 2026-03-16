# OghmaNotes File Storage Architecture - Complete Findings

## Overview
OghmaNotes employs a **hybrid storage architecture** with AWS S3 for binary files and PostgreSQL for metadata, structured around a consolidation plan to move toward a PostgreSQL-primary approach.

---

## 1. BINARY FILE STORAGE

### 1.1 S3 Configuration
**Location**: AWS S3 (`eu-north-1` region)

**Environment Variables** (`.env`):
```
STORAGE_BUCKET=<redacted>
STORAGE_ACCESS_KEY=<redacted>
STORAGE_SECRET_KEY=<redacted>
STORAGE_REGION=eu-north-1
STORAGE_ENDPOINT=https://s3.eu-north-1.amazonaws.com
STORAGE_PATH_STYLE=false
STORAGE_PREFIX=socsboard
MAX_FILE_SIZE=104857600 (100 MB)
ALLOWED_FILE_TYPES=md,pdf,jpg,jpeg,png,gif,zip,docx,doc,txt
PRESIGNED_URL_EXPIRY=86400 (24 hours)
```

### 1.2 Storage Paths
- **Note Attachments**: `notes/{noteId}/{filename}`
  - PDFs, images, videos uploaded by users
  - Signed URLs generated on-demand (24-hour expiry)
- **Notes Index**: `notes/index.json`
  - Master index of all notes (legacy S3-backed storage)
- **Tree Structure**: `tree/tree.json`
  - Folder hierarchy (legacy S3-backed storage)
- **OCR Output**: `notes/{noteId}/ocr-raw-{timestamp}.txt`
  - Raw extracted text from PDFs/images (audit trail)
- **User Settings**: `settings/{userId}/settings.json`
  - User preferences and configuration

### 1.3 S3 Storage Provider Implementation
**File**: `/src/lib/storage/s3.ts`

**Class**: `StoreS3` (MIT License - Notea)

**Key Methods**:
```typescript
- getSignUrl(path, expiresIn=600)          // Generate presigned URLs
- hasObject(path)                          // Check file existence
- getObject(path, isCompressed?)           // Retrieve file content
- getObjectMeta(path)                      // Get metadata only
- getObjectAndMeta(path, isCompressed?)    // Get content + metadata
- putObject(path, raw, options?, isCompressed?)  // Upload file
- deleteObject(path)                       // Delete file
- copyObject(fromPath, toPath, options)    // Copy file
```

**Features**:
- Supports AWS S3, MinIO, and S3-compatible endpoints
- Path-style URL option for MinIO
- Handles compression/decompression
- Custom metadata support
- Content type, cache control, disposition headers
- Error handling for NoSuchKey and not found scenarios

---

## 2. METADATA STORAGE (PostgreSQL)

### 2.1 Database Schema

**Main Tables**:

#### `app.notes` (Note Metadata)
```sql
- note_id (UUID PRIMARY KEY)
- user_id (UUID FOREIGN KEY)
- title (VARCHAR)
- content (TEXT)                    -- Markdown/HTML from editor
- s3_key (TEXT)                     -- Reference to S3 storage
- deleted (SMALLINT, 0=active)
- deleted_at (TIMESTAMPTZ)
- pinned (SMALLINT)
- shared (SMALLINT)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

-- OCR/Processing columns (future):
- extracted_text_raw (TEXT)         -- Full OCR output
- extracted_text_processed (TEXT)   -- Stopword-filtered text
- processing_status (VARCHAR)       -- 'pending', 'processing', 'completed', 'failed'
- processing_error (TEXT)
- ocr_job_id (VARCHAR)
- ocr_completed_at (TIMESTAMPTZ)

-- Vector embeddings (future):
- embedding (vector(1536))          -- pgvector for semantic search
- embedding_model (VARCHAR)
- embedding_updated_at (TIMESTAMPTZ)

-- Metadata flags:
- is_folder (BOOLEAN)
- primary_attachment_id (UUID)      -- References attachment table
```

#### `app.tree_items` (Folder Structure)
```sql
- id (SERIAL PRIMARY KEY)
- user_id (UUID FOREIGN KEY)
- note_id (UUID FOREIGN KEY)        -- Reference to note
- parent_id (UUID FOREIGN KEY)      -- Parent folder (NULL = root)
- is_expanded (BOOLEAN)             -- Folder expand/collapse state
- position (INTEGER)                -- Sort order
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

#### `app.attachments` (File Metadata)
```sql
- id (UUID PRIMARY KEY)
- note_id (UUID FOREIGN KEY)
- user_id (UUID FOREIGN KEY)
- filename (TEXT)                   -- Original filename
- s3_key (TEXT)                     -- S3 storage path
- mime_type (TEXT)                  -- Content type
- file_size (BIGINT)                -- File size in bytes
- processing_status (VARCHAR)       -- OCR job status
- ocr_job_id (VARCHAR)              -- BullMQ job ID
- ocr_completed_at (TIMESTAMPTZ)
- extracted_text_s3_key (TEXT)      -- Path to raw OCR output
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

#### `app.pdf_annotations` (PDF Markup)
```sql
- id (SERIAL PRIMARY KEY)
- note_id (UUID FOREIGN KEY)
- user_id (UUID FOREIGN KEY)
- attachment_id (INTEGER FOREIGN KEY)  -- Reference to PDF
- annotation_data (JSONB)           -- Highlight/markup data
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

### 2.2 Database Indexes
```sql
-- FTS index (full-text search):
CREATE INDEX idx_notes_fts ON app.notes USING GIN(
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(content, '') || ' ' || 
        COALESCE(extracted_text_processed, '')
    )
) WHERE deleted = 0;

-- Vector similarity index:
CREATE INDEX idx_notes_embedding_hnsw ON app.notes USING hnsw(embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

-- Processing status:
CREATE INDEX idx_notes_pending_processing ON app.notes(processing_status)
    WHERE processing_status IN ('pending', 'processing');

-- Tree performance:
CREATE INDEX idx_tree_items_user_id ON app.tree_items(user_id);
CREATE INDEX idx_tree_items_parent_id ON app.tree_items(parent_id);

-- Attachment queries:
CREATE INDEX idx_attachments_note_id ON app.attachments(note_id);
CREATE INDEX idx_attachments_processing ON app.attachments(processing_status);
```

---

## 3. FILE UPLOAD HANDLING

### 3.1 Upload Endpoint
**Route**: `POST /api/upload`
**File**: `/src/app/api/upload/route.ts`

**Authentication**: Required (JWT session validation)

**Request**:
```json
{
  "file": File,           // FormData file
  "noteId": string        // UUID of target note
}
```

**Process**:
1. Validate user session (401 if unauthorized)
2. Validate noteId (UUID format required)
3. Validate file provided
4. Read file buffer
5. Generate storage path: `notes/{noteId}/{fileName}`
6. Upload to S3 via `storage.putObject()`
7. Generate signed URL (3600 second expiry)
8. Return metadata

**Response**:
```json
{
  "success": true,
  "fileName": string,
  "path": string,         // S3 storage path
  "url": string,          // Presigned URL
  "size": number,
  "type": string          // MIME type
}
```

**Constraints**:
- Max file size: 100 MB
- Allowed types: md, pdf, jpg, jpeg, png, gif, zip, docx, doc, txt
- Presigned URL valid: 24 hours (86400 seconds)

### 3.2 File Retrieval Endpoint
**Route**: `GET /api/upload?path={storagePath}`
**File**: `/src/app/api/upload/route.ts`

**Authentication**: Required

**Process**:
1. Validate session
2. Check if file exists via `storage.hasObject()`
3. Generate presigned URL
4. Return URL to client

**Response**:
```json
{
  "success": true,
  "path": string,
  "url": string
}
```

---

## 4. STORAGE SERVICE ABSTRACTION

### 4.1 Storage Provider Pattern
**Base Class**: `/src/lib/storage/base.ts`

**StoreProvider (Abstract)**:
```typescript
interface StoreProviderConfig {
  readonly prefix?: string;
}

abstract class StoreProvider {
  protected getPath(...paths: string[]): string  // Builds prefixed paths
  abstract getSignUrl(path, expiresIn?)
  abstract hasObject(path)
  abstract getObject(path, isCompressed?)
  abstract getObjectMeta(path)
  abstract getObjectAndMeta(path, isCompressed?)
  abstract putObject(path, raw, options?, isCompressed?)
  abstract deleteObject(path)
  abstract copyObject(fromPath, toPath, options)
}
```

### 4.2 Initialization
**File**: `/src/lib/storage/init.ts`

**Singleton Pattern**:
```typescript
function validateS3Config(): S3Config {
  // Validates STORAGE_BUCKET (required)
  // Reads: STORAGE_REGION, STORAGE_ENDPOINT, STORAGE_PATH_STYLE, STORAGE_PREFIX
  // Reads optional: STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
}

export function getStorageProvider(): StoreS3 {
  // Global singleton instance
  // Initialized on first call
  // Returns configured StoreS3 instance
}

export function resetStorageProvider(): void {
  // For testing only
}
```

**Configuration Priority**:
1. Environment variables (required)
2. IAM role credentials (fallback)
3. Throws error if STORAGE_BUCKET missing

### 4.3 Storage Utilities
**File**: `/src/lib/storage/str.ts` & `/src/lib/storage/utils.ts`

**String/Buffer Conversion**:
```typescript
- toBuffer(raw, compressed?)        // String/object → Buffer
- toStr(buffer, decompressed?)      // Buffer → string
- tryJSON(str)                      // Safe JSON parsing
- strCompress(str)                  // GZIP compression
- strDecompress(raw)                // GZIP decompression
- streamToBuffer(stream)            // Stream → Buffer
```

---

## 5. NOTES STORAGE (Hybrid Backend)

### 5.1 S3-Backed Storage
**File**: `/src/lib/notes/storage/s3-storage.ts`

**Functions**:
```typescript
- getAllNotesFromS3(): Promise<NoteModel[]>
- getNoteFromS3(noteId): Promise<NoteModel>
- saveNoteToS3(note): Promise<void>
- deleteNoteFromS3(noteId): Promise<void>
- getTreeFromS3(): Promise<TreeModel>
- saveTreeToS3(tree): Promise<void>
- getSettingsFromS3(userId): Promise<object>
- saveSettingsToS3(userId, settings): Promise<void>
- getTrashFromS3(): Promise<NoteModel[]>
- rebuildTreeFromS3(): Promise<TreeModel>
```

**Storage Paths**:
- `notes/index.json` - Master note index
- `notes/{noteId}/note.json` - Individual note
- `tree/tree.json` - Tree structure
- `settings/{userId}/settings.json` - User settings

### 5.2 PostgreSQL-Backed Storage
**File**: `/src/lib/notes/storage/pg-tree.js`

**Functions**:
```typescript
- getTreeFromPG(userId)
- addNoteToTree(userId, noteId, parentId)
- removeNoteFromTree(userId, noteId)
- updateTreeItem(userId, noteId, updates)
- moveNoteInTree(userId, noteId, newParentId)
- syncTreeWithNotes(userId)
- getOrphanedNotes(userId)
- rebuildOrphanedNotes(userId)
```

**Features**:
- Per-user tree isolation
- A-Z alphabetical sorting by title
- Soft delete awareness
- Orphaned note detection/recovery

### 5.3 Sync Mechanism
**Route**: `GET/POST /api/notes/sync-s3`
**File**: `/src/app/api/notes/sync-s3/route.ts`

**Sync Function**: `/src/lib/notes/migrations/sync-s3-to-pg.js`

**Process**:
```
GET  /api/notes/sync-s3  → checkSyncStatus(userId)
  Returns: { totalInS3, totalInPG, missingInPG, missingNoteIds }

POST /api/notes/sync-s3  → syncS3ToPG(userId)
  For each S3 note not in PostgreSQL:
    1. Insert into app.notes table
    2. Add to tree_items
    3. Track errors
  Returns: { success, totalInS3, synced, alreadyInPG, failed, errors }
```

**Note**: This is a **one-way sync** (S3→PG), indicating transition phase.

---

## 6. PDF ANNOTATIONS

**File**: `/src/lib/notes/storage/pdf-annotations.js`

**Functions**:
```typescript
- saveAnnotations(userId, noteId, attachmentId, annotationData)
- getAnnotations(userId, noteId, attachmentId?)
- deleteAnnotations(userId, annotationId)
- deleteNoteAnnotations(userId, noteId)
```

**Storage**:
- All annotation data stored in `app.pdf_annotations.annotation_data` (JSONB)
- Attached to specific `app.attachments` records
- Supports user highlighting, markup, comments

---

## 7. FILE PATH/URL GENERATION

### 7.1 Path Construction
**Base Class Method**: `getPath(...paths: string[]): string`

```typescript
// Applies prefix + joins paths with /
// Example: 
//   prefix = 'socsboard/'
//   getPath('notes', noteId, fileName)
//   → 'socsboard/notes/{noteId}/{fileName}'
```

### 7.2 Signed URL Generation
**S3 Storage**:
```typescript
async getSignUrl(path: string, expiresIn = 600): Promise<string> {
  // Uses AWS SDK getSignedUrl() with GetObjectCommand
  // Default: 600 seconds (10 minutes)
  // Upload endpoint uses: 3600 seconds (1 hour)
  // File retrieval uses: 3600 seconds (1 hour)
}
```

**Presigner Logic**:
- AWS SDK v3: `@aws-sdk/s3-request-presigner`
- Supports MinIO with custom port workaround
- Returns HTTPS URL valid for specified duration

---

## 8. FUTURE ARCHITECTURE (PLANNED)

### 8.1 Consolidation Goal: PostgreSQL Primary
**Reference**: `/STORAGE_ARCHITECTURE.md` (comprehensive migration plan)

**Target State**:
- **PostgreSQL**: Single source of truth
  - Note content, metadata, tree structure
  - Extracted text, embeddings
  - PDF annotations
- **S3**: Binary files only
  - PDFs, images, videos (attachments)
  - Raw OCR output (audit trail)
  - Signed URLs generated on-demand

### 8.2 Planned Additions
**BullMQ Worker** for async processing:
```
File Upload → S3 → BullMQ OCR Job → Text Extract → Embedding → PostgreSQL
```

**Stack**:
- Job Queue: BullMQ + Redis
- OCR: Tesseract.js or Paddle OCR
- Embeddings: OpenAI text-embedding-3-small
- Vector Search: pgvector + HNSW index
- Full-Text Search: PostgreSQL tsvector

**Benefits**:
- Single source of truth
- No sync complexity
- Scalable async processing
- Dual search (FTS + semantic)
- RAG-ready with embeddings

---

## 9. DEPENDENCIES

### 9.1 Storage Libraries
```json
{
  "@aws-sdk/client-s3": "^3.1009.0",
  "@aws-sdk/s3-request-presigner": "^3.1009.0",
  "minio": "^8.0.7",
  "pdf-parse": "^2.4.5",
  "pdfjs-dist": "5.5.207",
  "react-pdf": "10.4.1"
}
```

### 9.2 Database
```json
{
  "pg": "^8.20.0",
  "postgres": "^3.4.8"
}
```

---

## 10. SECURITY CONSIDERATIONS

### 10.1 Authentication
- All file operations require valid JWT session
- `validateSession()` checks before upload/retrieve
- Returns 401 Unauthorized if missing credentials

### 10.2 File Validation
- UUID validation for noteId (prevents invalid references)
- File type whitelist (md, pdf, jpg, jpeg, png, gif, zip, docx, doc, txt)
- File size limit: 100 MB
- MIME type tracking

### 10.3 URL Security
- Presigned URLs expire after 24 hours
- AWS SDK handles signature generation
- No direct S3 bucket access (credentials not exposed to client)

### 10.4 Data Protection
- Soft deletes (deleted_at flag) for audit trail
- User isolation via user_id foreign keys
- Tree structure per-user (user_id in tree_items)

---

## 11. FILE STORAGE FLOW DIAGRAM

```
USER ACTION (Upload)
    ↓
/api/upload POST endpoint
    ├─ Validate session ✓
    ├─ Validate noteId (UUID) ✓
    ├─ Validate file ✓
    ↓
StoreS3.putObject()
    ├─ Create S3Client with AWS SDK
    ├─ Generate full path: {prefix}/notes/{noteId}/{fileName}
    ├─ Execute PutObjectCommand
    ↓
S3 Bucket (<redacted>)
    └─ Store file at: socsboard/notes/{noteId}/{fileName}
    ↓
StoreS3.getSignUrl()
    ├─ Create GetObjectCommand
    ├─ Generate presigned URL (AWS SDK)
    ├─ Valid for 3600 seconds (24 hours)
    ↓
Return to Client
    └─ { success, fileName, path, url, size, type }

USER ACTION (Download/View)
    ↓
/api/upload GET endpoint
    ├─ Validate session ✓
    ├─ Validate path parameter ✓
    ↓
StoreS3.hasObject()
    └─ Check file existence via HeadObjectCommand
    ↓
StoreS3.getSignUrl()
    ├─ Generate new presigned URL
    ↓
Return to Client
    └─ { success, path, url }
```

---

## 12. CURRENT DATA REDUNDANCY

**Dual Backend Issue** (being addressed):
- Notes exist in **S3** (index.json)
- Notes also exist in **PostgreSQL** (app.notes table)
- Tree structure in **S3** (tree.json)
- Tree structure also in **PostgreSQL** (app.tree_items)
- User settings in **S3** (settings/{userId}/settings.json)

**Resolution Path**:
1. Implement one-way sync (S3→PG) ✓ (exists)
2. Migrate data to PostgreSQL
3. Remove S3-based note/tree/settings storage
4. Keep S3 for binary attachments only

---

## 13. MOCK STORAGE (Development)

**File**: `/src/lib/notes/storage/mock-storage.ts`

**Purpose**: In-memory storage for development/testing

**Data Structures**:
- `MOCK_NOTES_STORAGE` - Map of notes
- `MOCK_TREE_STORAGE` - Tree structure with initial sample data

**Contains**:
- Helper functions for tree manipulation
- Sample notes (Welcome, Projects, Research)
- Hierarchical structure (folders with sub-folders)

**Note**: Replaced by real storage in production (S3 + PostgreSQL)

---

## SUMMARY TABLE

| Aspect | Current | Planned |
|--------|---------|---------|
| **Notes** | S3 + PostgreSQL | PostgreSQL only |
| **Tree** | S3 + PostgreSQL | PostgreSQL only |
| **Attachments** | S3 (path tracking in DB) | S3 (full metadata in DB) |
| **Annotations** | PostgreSQL | PostgreSQL |
| **Settings** | S3 | PostgreSQL |
| **Extracted Text** | None | PostgreSQL + S3 (raw) |
| **Embeddings** | None | PostgreSQL (pgvector) |
| **Search** | None | FTS + Semantic search |
| **OCR Pipeline** | None | BullMQ worker |

---

## FILE LOCATIONS SUMMARY

### Storage Configuration
- `.env` - AWS S3 credentials and settings
- `.env.example` - Template configuration

### Storage Implementation
- `/src/lib/storage/` - Core storage providers
  - `s3.ts` - S3 implementation
  - `base.ts` - Base provider interface
  - `init.ts` - Initialization & singleton
  - `str.ts` - String/Buffer utilities
  - `utils.ts` - Stream utilities
  - `logger.ts` - Logging

### Upload API
- `/src/app/api/upload/route.ts` - Upload/retrieve endpoints

### Notes Storage
- `/src/lib/notes/storage/`
  - `s3-storage.ts` - S3-backed note operations
  - `pg-tree.js` - PostgreSQL tree operations
  - `pdf-annotations.js` - PDF markup storage
  - `mock-storage.ts` - Development mock data

### Sync & Migration
- `/src/app/api/notes/sync-s3/route.ts` - Sync endpoint
- `/src/lib/notes/migrations/sync-s3-to-pg.js` - Sync logic

### Database
- `/database/migrations/` - Schema migrations
  - `001_create_notes_table.sql`
  - `002_add_tree_and_vectors.sql`
  - `00X_*_uuid_*.sql` - UUID migrations

---

Generated: 2025-03-16
