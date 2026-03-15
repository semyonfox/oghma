# OghmaNotes Storage Architecture & Data Pipeline

## Overview

This document defines the consolidated storage strategy for OghmaNotes, addressing the current dual-backend problem while planning for OCR, RAG, and embedding workflows via BullMQ.

---

## Current Problem

**Dual Storage Issue:**
- Notes content, metadata, and tree structure exist in BOTH PostgreSQL and S3
- One-way sync (S3→PG) is incomplete and unreliable
- No clear source of truth

**Goal:** Single source of truth with proper separation of concerns.

---

## Architecture: PostgreSQL-Primary with S3 for Binaries

### Storage Distribution

| Data Type | Primary Backend | Secondary | Purpose |
|-----------|-----------------|-----------|---------|
| **Note Metadata** | PostgreSQL | - | user_id, title, timestamps, flags (pinned, deleted, shared) |
| **Note Content (Markdown)** | PostgreSQL | - | HTML/plaintext edited in Lexical editor |
| **Tree Structure** | PostgreSQL | - | folder hierarchy, parent_id, position |
| **Extracted Text (Searchable)** | PostgreSQL | - | OCR output + stopword-filtered + punctuation-removed for FTS |
| **Embeddings/Vectors** | PostgreSQL (pgvector) | - | 1536-dim embeddings for semantic search & RAG |
| **PDF Annotations** | PostgreSQL | - | user highlights, notes on PDFs |
| **Binary Attachments** | S3 | DB refs | PDFs, images, videos (signed URLs) |
| **Raw Extracted Text** | S3 | DB ref | Full OCR output before processing (audit trail) |
| **Processing Metadata** | PostgreSQL | - | status, queue job ID, error logs, timestamps |

### Why This Structure?

1. **PostgreSQL (source of truth):**
   - All state is here; single query answers any question
   - Transactions ensure consistency
   - Full-text search (tsvector index) on markdown + extracted text
   - Vector embeddings for semantic search
   - Audit trail via `updated_at` triggers

2. **S3 (asset storage only):**
   - Large binary files (PDFs, images, videos)
   - Raw OCR output as audit trail
   - Signed URLs generated on-demand
   - Can be rebuilt from source files

3. **Benefits:**
   - No sync complexity
   - Consistent state
   - Easier querying and retrieval
   - Clear responsibilities

---

## Database Schema (PostgreSQL)

### New Columns in `app.notes`

```sql
-- In existing app.notes table, add:
ALTER TABLE app.notes ADD COLUMN (
    -- Content storage
    content TEXT,  -- Markdown/HTML from Lexical editor
    
    -- Extracted text (post-OCR, pre-processing)
    extracted_text_raw TEXT,      -- Full OCR output (can be large)
    extracted_text_processed TEXT,  -- Stopword-filtered, punctuation removed
    
    -- Processing metadata
    processing_status VARCHAR DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    processing_error TEXT,          -- Error message if failed
    ocr_job_id VARCHAR,             -- BullMQ job ID for traceability
    ocr_completed_at TIMESTAMPTZ,
    
    -- Attachment references
    primary_attachment_id UUID,     -- If this note is a PDF/image viewer
    
    -- Vector embeddings (pgvector)
    embedding vector(1536),  -- OpenAI text-embedding-3-small or similar
    embedding_model VARCHAR,  -- 'openai-text-embedding-3-small', etc.
    embedding_updated_at TIMESTAMPTZ,
    
    -- Metadata flags
    is_folder BOOLEAN DEFAULT false,
    deleted SMALLINT DEFAULT 0,  -- 0=active, 1=soft-deleted
    deleted_at TIMESTAMPTZ,
    pinned SMALLINT DEFAULT 0,
    shared SMALLINT DEFAULT 0,
    
    CONSTRAINT processing_status_check CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Full-text search index (markdown + extracted processed text)
CREATE INDEX idx_notes_fts ON app.notes USING GIN(
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(content, '') || ' ' || 
        COALESCE(extracted_text_processed, '')
    )
) WHERE deleted = 0 AND deleted_at IS NULL;

-- Vector similarity index (pgvector)
CREATE INDEX idx_notes_embedding_hnsw ON app.notes USING hnsw(embedding vector_cosine_ops)
    WHERE deleted = 0 AND deleted_at IS NULL AND embedding IS NOT NULL;

-- Processing status tracking
CREATE INDEX idx_notes_pending_processing ON app.notes(processing_status)
    WHERE processing_status IN ('pending', 'processing');
```

### Attachments Table (Enhanced)

```sql
CREATE TABLE app.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    s3_key TEXT NOT NULL,           -- Path in S3
    mime_type TEXT,
    file_size BIGINT,
    
    -- OCR & Processing
    processing_status VARCHAR DEFAULT 'pending',
    ocr_job_id VARCHAR,             -- BullMQ job ID
    ocr_completed_at TIMESTAMPTZ,
    
    -- References (if extracted text is stored separately)
    extracted_text_s3_key TEXT,     -- S3 path to raw OCR output
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_processing ON app.attachments(processing_status)
    WHERE processing_status IN ('pending', 'processing');
```

---

## Data Flow: File Upload → Searchable

```
1. USER UPLOADS PDF/IMAGE
   └─> /api/upload (authenticated)
       ├─> S3: store binary at notes/{noteId}/{filename}
       ├─> DB: insert attachment record with processing_status='pending'
       └─> BullMQ: enqueue OCR job
            └─> returns jobId → save to attachments.ocr_job_id

2. BULLMQ WORKER: OCR_JOB
   (Runs async via job queue, can retry, timeout-safe)
   
   ├─> Download PDF from S3
   ├─> Run OCR (tesseract or cloud API)
   ├─> Upload raw output to S3 at notes/{noteId}/ocr-raw-{timestamp}.txt
   ├─> Process extracted text:
   │   ├─> Lowercase
   │   ├─> Remove punctuation
   │   ├─> Remove stop words
   │   └─> Store in app.notes.extracted_text_processed
   ├─> Generate embeddings:
   │   ├─> Call embedding API (OpenAI, local model)
   │   ├─> Store in app.notes.embedding (pgvector)
   │   ├─> Store model name in app.notes.embedding_model
   ├─> Update app.notes:
   │   ├─> processing_status='completed'
   │   ├─> extracted_text_raw (if small enough)
   │   ├─> ocr_completed_at=NOW()
   └─> Update app.attachments.processing_status='completed'

3. USER SEARCHES
   ├─> Option A: Full-text search (FTS)
   │   SELECT * FROM app.notes
   │   WHERE to_tsvector('english', extracted_text_processed) @@ plainto_tsquery('english', 'query')
   │   AND deleted = 0;
   │
   └─> Option B: Semantic search (embeddings)
       SELECT * FROM app.notes
       WHERE deleted = 0
       ORDER BY embedding <-> query_embedding
       LIMIT 10;

4. RAG PIPELINE (retrieval-augmented generation)
   ├─> User question + semantic search finds relevant notes
   ├─> Retrieve app.notes.extracted_text_processed (or content)
   ├─> Send to LLM as context
   └─> LLM generates answer
```

---

## API Endpoints (Revised)

### Upload Endpoint

```typescript
// POST /api/upload
// Authenticated, returns note attachment ID and S3 signed URL

export async function POST(request: NextRequest) {
    const session = await validateSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const noteId = formData.get('noteId') as string;

    if (!file || !noteId || !isValidUUID(noteId)) {
        return NextResponse.json({ error: 'file and valid noteId required' }, { status: 400 });
    }

    try {
        // 1. Upload to S3
        const s3Key = `notes/${noteId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
        const storage = getStorageProvider();
        await storage.putObject(s3Key, Buffer.from(await file.arrayBuffer()));

        // 2. Insert attachment record with pending OCR
        const db = getDatabase();
        const attachment = await db`
            INSERT INTO app.attachments (note_id, user_id, filename, s3_key, mime_type, file_size, processing_status)
            VALUES (${noteId}, ${session.user_id}, ${file.name}, ${s3Key}, ${file.type}, ${file.size}, 'pending')
            RETURNING id, processing_status
        `;

        // 3. Enqueue OCR job via BullMQ
        const ocrQueue = await getOCRQueue();
        const job = await ocrQueue.add('ocr', {
            attachmentId: attachment[0].id,
            noteId,
            s3Key,
            fileName: file.name,
            mimeType: file.type,
        }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: false,  // Keep job history for audit
        });

        // 4. Update attachment with job ID
        await db`UPDATE app.attachments SET ocr_job_id = ${job.id} WHERE id = ${attachment[0].id}`;

        // 5. Return signed URL for preview
        const signedUrl = await storage.getSignUrl(s3Key, 3600);

        return NextResponse.json({
            success: true,
            attachment: {
                id: attachment[0].id,
                fileName: file.name,
                s3Key,
                processingStatus: attachment[0].processing_status,
                jobId: job.id,
            },
            previewUrl: signedUrl,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
```

### Processing Status Endpoint

```typescript
// GET /api/notes/{noteId}/processing-status
// Returns OCR + embedding status for UI progress indicators

export async function GET(request: NextRequest, { params }: { params: { noteId: string } }) {
    const session = await validateSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDatabase();
    const attachments = await db`
        SELECT 
            id, 
            filename, 
            processing_status, 
            ocr_job_id,
            ocr_completed_at
        FROM app.attachments
        WHERE note_id = ${params.noteId} AND user_id = ${session.user_id}
    `;

    // Get BullMQ job status
    const ocrQueue = await getOCRQueue();
    const statusInfo = await Promise.all(
        attachments.map(async (att) => ({
            attachmentId: att.id,
            filename: att.filename,
            processingStatus: att.processing_status,
            jobId: att.ocr_job_id,
            jobStatus: att.ocr_job_id ? await ocrQueue.getJobState(att.ocr_job_id) : null,
            completedAt: att.ocr_completed_at,
        }))
    );

    return NextResponse.json({ success: true, attachments: statusInfo });
}
```

### Search Endpoints

```typescript
// POST /api/search
// Supports both FTS and semantic search

export async function POST(request: NextRequest) {
    const session = await validateSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, type = 'fts', limit = 20 } = await request.json();
    // type: 'fts' | 'semantic'

    const db = getDatabase();

    if (type === 'fts') {
        // Full-text search on markdown + extracted text
        const results = await db`
            SELECT 
                note_id, title, content, extracted_text_processed,
                ts_rank(
                    to_tsvector('english', extracted_text_processed),
                    plainto_tsquery('english', ${query})
                ) AS rank
            FROM app.notes
            WHERE deleted = 0 
              AND deleted_at IS NULL
              AND user_id = ${session.user_id}
              AND to_tsvector('english', extracted_text_processed || content) @@ plainto_tsquery('english', ${query})
            ORDER BY rank DESC
            LIMIT ${limit}
        `;
        return NextResponse.json({ success: true, results });
    } 
    else if (type === 'semantic') {
        // Semantic search via embeddings
        // 1. Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        
        // 2. Find similar notes
        const results = await db`
            SELECT 
                note_id, title, content, extracted_text_processed,
                embedding <-> ${JSON.stringify(queryEmbedding)} AS distance
            FROM app.notes
            WHERE deleted = 0 
              AND deleted_at IS NULL
              AND user_id = ${session.user_id}
              AND embedding IS NOT NULL
            ORDER BY distance
            LIMIT ${limit}
        `;
        return NextResponse.json({ success: true, results });
    }
}
```

---

## BullMQ Worker: OCR Job

```typescript
// src/lib/notes/workers/ocr-worker.ts

import Bull from 'bullmq';
import * as Tesseract from 'tesseract.js';  // or cloud API
import { getStorageProvider } from '@/lib/storage/init';
import { getDatabase } from '@/database/pgsql';
import { removeStopwords, stopwords } from 'stopword';

const OCR_QUEUE_NAME = 'ocr-jobs';
const EMBEDDING_MODEL = 'openai-text-embedding-3-small';

interface OCRJobData {
    attachmentId: string;
    noteId: string;
    s3Key: string;
    fileName: string;
    mimeType: string;
}

export async function processOCRJob(job: Bull.Job<OCRJobData>) {
    const { attachmentId, noteId, s3Key, fileName, mimeType } = job.data;
    const db = getDatabase();
    const storage = getStorageProvider();

    try {
        // Update status: processing
        await db`
            UPDATE app.attachments 
            SET processing_status = 'processing'
            WHERE id = ${attachmentId}
        `;

        // 1. Download from S3
        job.updateProgress(10);
        const fileBuffer = await storage.getObject(s3Key);
        if (!fileBuffer) throw new Error('File not found in S3');

        // 2. Run OCR
        job.updateProgress(30);
        let extractedTextRaw = '';
        
        if (mimeType.startsWith('image/')) {
            // Image OCR via Tesseract
            const result = await Tesseract.recognize(Buffer.from(fileBuffer), 'eng');
            extractedTextRaw = result.data.text;
        } else if (mimeType === 'application/pdf') {
            // PDF OCR via pdfjs + Tesseract per page
            const pdfData = await pdf(Buffer.from(fileBuffer));
            const textPages = await Promise.all(
                Array.from({ length: pdfData.numpages }, async (_, i) =>
                    Tesseract.recognize(pdfData.pages[i + 1].getImageData(), 'eng')
                )
            );
            extractedTextRaw = textPages.map(r => r.data.text).join('\n');
        }

        // Upload raw OCR output to S3 for audit trail
        job.updateProgress(50);
        const rawOCRKey = `notes/${noteId}/ocr-raw-${Date.now()}.txt`;
        await storage.putObject(rawOCRKey, extractedTextRaw);

        // 3. Process extracted text (stopword removal, punctuation)
        job.updateProgress(60);
        const processedText = processExtractedText(extractedTextRaw);

        // 4. Generate embeddings
        job.updateProgress(75);
        const embedding = await generateEmbedding(processedText);

        // 5. Update database
        job.updateProgress(90);
        await db`
            UPDATE app.notes 
            SET 
                extracted_text_raw = ${extractedTextRaw},
                extracted_text_processed = ${processedText},
                embedding = ${JSON.stringify(embedding)},
                embedding_model = ${EMBEDDING_MODEL},
                embedding_updated_at = NOW(),
                processing_status = 'completed',
                ocr_completed_at = NOW()
            WHERE note_id = ${noteId}
        `;

        await db`
            UPDATE app.attachments 
            SET 
                processing_status = 'completed',
                ocr_completed_at = NOW()
            WHERE id = ${attachmentId}
        `;

        job.updateProgress(100);
        return { success: true, processedText, embedding };

    } catch (error) {
        console.error(`OCR job failed for attachment ${attachmentId}:`, error);
        
        // Mark as failed
        await db`
            UPDATE app.attachments 
            SET 
                processing_status = 'failed',
                processing_error = ${error.message}
            WHERE id = ${attachmentId}
        `;

        throw error;  // BullMQ will retry
    }
}

function processExtractedText(raw: string): string {
    // 1. Lowercase
    let processed = raw.toLowerCase();
    
    // 2. Remove punctuation (keep word boundaries)
    processed = processed.replace(/[^\w\s]/g, ' ');
    
    // 3. Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // 4. Remove stop words
    const words = processed.split(' ');
    const filtered = removeStopwords(words, stopwords.en);
    
    return filtered.join(' ');
}

async function generateEmbedding(text: string): Promise<number[]> {
    // Use OpenAI API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text,
        }),
    });

    const data = await response.json();
    return data.data[0].embedding;
}
```

---

## Migration Path (Step-by-Step)

### Phase 1: Schema & Cleanup (Week 1)
- [ ] Remove Prisma dependencies
- [ ] Add new columns to `app.notes` (schema migration)
- [ ] Add `app.attachments` improvements
- [ ] Create FTS and vector indexes
- [ ] Update `middleware.ts` to use single auth
- [ ] Remove duplicate auth code

### Phase 2: API Refactor (Week 2-3)
- [ ] Update `/api/upload` with auth check
- [ ] Implement `/api/search` with FTS + semantic
- [ ] Create `/api/notes/{noteId}/processing-status` endpoint
- [ ] Remove S3 calls from note CRUD endpoints
- [ ] Consolidate tree storage to PostgreSQL only

### Phase 3: BullMQ Integration (Week 3-4)
- [ ] Install bullmq + Redis
- [ ] Implement OCR worker (`src/lib/notes/workers/ocr-worker.ts`)
- [ ] Set up job monitoring dashboard
- [ ] Add retry logic and error handling
- [ ] Test with sample PDFs

### Phase 4: Data Migration (Week 4-5)
- [ ] Build one-time migration script:
  - Fetch all notes from S3
  - Insert into PostgreSQL `app.notes`
  - Fetch tree from S3
  - Insert into PostgreSQL `app.tree_items`
  - Verify consistency
- [ ] Run migration in staging
- [ ] Validate no data loss
- [ ] Deploy to production

### Phase 5: Cleanup (Week 5)
- [ ] Delete S3 sync code
- [ ] Delete legacy storage abstraction
- [ ] Delete old S3 note files
- [ ] Archive old API routes
- [ ] Full regression testing

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Job Queue** | BullMQ + Redis | OCR/embedding processing |
| **OCR** | Tesseract.js or Paddle OCR | Extract text from PDFs/images |
| **Embeddings** | OpenAI text-embedding-3-small | Semantic search vectors |
| **Vector Search** | pgvector + HNSW index | Fast similarity search |
| **Full-Text Search** | PostgreSQL tsvector | Keyword search |
| **Database** | PostgreSQL 15+ | Single source of truth |
| **File Storage** | S3/MinIO | Binary assets only |

---

## Summary of Changes

| Before | After |
|--------|-------|
| Notes in S3 + PostgreSQL | Notes in PostgreSQL only |
| Tree in S3 + PostgreSQL | Tree in PostgreSQL only |
| One-way S3→PG sync | No sync needed |
| Dual auth (JWT + OAuth) | Single next-auth |
| No OCR pipeline | BullMQ + OCR worker |
| No embeddings | pgvector embeddings + semantic search |
| Manual file uploads | Auto-processing via queue |
| Prisma installed (unused) | Removed |

---

## Benefits

✅ **Single source of truth** (PostgreSQL)
✅ **No sync complexity**
✅ **Consistent state always**
✅ **Scalable OCR pipeline** (BullMQ worker pool)
✅ **Dual search modes** (FTS + semantic)
✅ **RAG-ready** (embeddings + retrieved text)
✅ **Audit trail** (raw OCR + timestamps)
✅ **Progress tracking** (job statuses in UI)
✅ **Error handling** (retry logic, dead letters)
✅ **Cost-effective** (reduce S3 operations)
