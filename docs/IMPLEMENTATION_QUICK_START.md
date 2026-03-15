# Quick Start: Consolidated Storage Implementation

This guide gives you the exact code templates to start Phase 1-3.

## 1. Database Migration

Create `database/migrations/006_add_processing_pipeline_columns.sql`:

```sql
-- Add processing pipeline columns to app.notes
ALTER TABLE app.notes ADD COLUMN (
    content TEXT,
    extracted_text_raw TEXT,
    extracted_text_processed TEXT,
    processing_status VARCHAR(20) DEFAULT 'pending',
    processing_error TEXT,
    ocr_job_id VARCHAR(255),
    ocr_completed_at TIMESTAMPTZ,
    primary_attachment_id UUID,
    embedding vector(1536),
    embedding_model VARCHAR(100),
    embedding_updated_at TIMESTAMPTZ,
    CONSTRAINT processing_status_check CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Add columns to app.attachments
ALTER TABLE app.attachments ADD COLUMN (
    processing_status VARCHAR(20) DEFAULT 'pending',
    ocr_job_id VARCHAR(255),
    extracted_text_s3_key TEXT
);

-- Create indexes
CREATE INDEX idx_notes_processing_status ON app.notes(processing_status)
    WHERE processing_status IN ('pending', 'processing');

CREATE INDEX idx_notes_fts ON app.notes USING GIN(
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(content, '') || ' ' || 
        COALESCE(extracted_text_processed, '')
    )
) WHERE deleted = 0 AND deleted_at IS NULL;

CREATE INDEX idx_notes_embedding_hnsw ON app.notes USING hnsw(embedding vector_cosine_ops)
    WHERE deleted = 0 AND deleted_at IS NULL AND embedding IS NOT NULL;

CREATE INDEX idx_attachments_processing ON app.attachments(processing_status)
    WHERE processing_status IN ('pending', 'processing');
```

Run: `npm run db:migrate`

## 2. Install Dependencies

```bash
# Remove Prisma
npm uninstall prisma @prisma/client

# Add BullMQ + processing
npm install bullmq redis
npm install stopword tesseract.js pdf-parse
npm install openai

# Types
npm install --save-dev @types/bullmq
```

## 3. Create Queue Configuration

Create `src/lib/notes/workers/queue.ts`:

```typescript
import { Queue, Worker } from 'bullmq';
import Redis from 'redis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const ocrQueue = new Queue('ocr', { connection: redis });

export async function getOCRQueue() {
  return ocrQueue;
}

export async function closeQueue() {
  await ocrQueue.close();
  await redis.quit();
}
```

## 4. Create OCR Worker

Create `src/lib/notes/workers/ocr-worker.ts`:

```typescript
import { Worker, Job } from 'bullmq';
import Redis from 'redis';
import Tesseract from 'tesseract.js';
import { removeStopwords } from 'stopword';
import { getStorageProvider } from '@/lib/storage/init';
import sql from '@/database/pgsql';
import { generateEmbedding } from '@/lib/embeddings-provider';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface OCRJobData {
  attachmentId: string;
  noteId: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
}

async function processOCRJob(job: Job<OCRJobData>) {
  const { attachmentId, noteId, s3Key, fileName, mimeType } = job.data;
  const storage = getStorageProvider();

  try {
    // 1. Download from S3
    job.updateProgress(10);
    const fileBuffer = await storage.getObject(s3Key);
    if (!fileBuffer) throw new Error('File not found in S3');

    // 2. OCR
    job.updateProgress(30);
    let extractedTextRaw = '';
    
    if (mimeType.startsWith('image/')) {
      const result = await Tesseract.recognize(fileBuffer, 'eng');
      extractedTextRaw = result.data.text;
    }

    // 3. Process text
    job.updateProgress(60);
    const processedText = processExtractedText(extractedTextRaw);

    // 4. Generate embeddings
    job.updateProgress(75);
    const embedding = await generateEmbedding(processedText);

    // 5. Update database
    job.updateProgress(90);
    await sql`
      UPDATE app.notes 
      SET 
        extracted_text_raw = ${extractedTextRaw},
        extracted_text_processed = ${processedText},
        embedding = ${JSON.stringify(embedding)},
        embedding_model = 'openai-text-embedding-3-small',
        embedding_updated_at = NOW(),
        processing_status = 'completed',
        ocr_completed_at = NOW()
      WHERE note_id = ${noteId}
    `;

    await sql`
      UPDATE app.attachments 
      SET processing_status = 'completed'
      WHERE id = ${attachmentId}
    `;

    job.updateProgress(100);
    return { success: true, processedText };

  } catch (error) {
    console.error(`OCR job failed:`, error);
    await sql`
      UPDATE app.attachments 
      SET processing_status = 'failed', processing_error = ${error.message}
      WHERE id = ${attachmentId}
    `;
    throw error;
  }
}

function processExtractedText(raw: string): string {
  let processed = raw.toLowerCase();
  processed = processed.replace(/[^\w\s]/g, ' ');
  processed = processed.replace(/\s+/g, ' ').trim();
  
  const words = processed.split(' ');
  const filtered = removeStopwords(words);
  
  return filtered.join(' ');
}

export const ocrWorker = new Worker('ocr', processOCRJob, {
  connection: redis,
  concurrency: 3,
});

ocrWorker.on('completed', (job) => {
  console.log(`[OCR] Job ${job.id} completed`);
});

ocrWorker.on('failed', (job, error) => {
  console.error(`[OCR] Job ${job?.id} failed:`, error.message);
});
```

## 5. Create Embeddings Provider

Create `src/lib/embeddings-provider.ts`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}
```

## 6. Update Upload Endpoint

Update `src/app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage/init';
import { getOCRQueue } from '@/lib/notes/workers/queue';
import sql from '@/database/pgsql';
import { v4 as uuidv4 } from 'uuid';

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const session = await validateSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const noteId = formData.get('noteId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!noteId || !isValidUUID(noteId)) {
      return NextResponse.json({ error: 'Valid noteId required' }, { status: 400 });
    }

    // 3. Upload to S3
    const attachmentId = uuidv4();
    const s3Key = `notes/${noteId}/${attachmentId}-${file.name}`;
    const storage = getStorageProvider();
    await storage.putObject(s3Key, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
    });

    // 4. Create attachment record
    const attachment = await sql`
      INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size, processing_status)
      VALUES (${attachmentId}, ${noteId}, ${session.user_id}, ${file.name}, ${s3Key}, ${file.type}, ${file.size}, 'pending')
      RETURNING id, processing_status
    `;

    // 5. Enqueue OCR job
    const ocrQueue = await getOCRQueue();
    const job = await ocrQueue.add('ocr', {
      attachmentId,
      noteId,
      s3Key,
      fileName: file.name,
      mimeType: file.type,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,
    });

    // 6. Store job ID
    await sql`
      UPDATE app.attachments 
      SET ocr_job_id = ${job.id}
      WHERE id = ${attachmentId}
    `;

    // 7. Return response
    const signedUrl = await storage.getSignUrl(s3Key, 3600);
    return NextResponse.json({
      success: true,
      attachment: {
        id: attachmentId,
        fileName: file.name,
        s3Key,
        processingStatus: 'pending',
        jobId: job.id,
      },
      previewUrl: signedUrl,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
```

## 7. Add to Environment

Add to `.env.local`:

```
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-key-here
```

## 8. Start Worker in App Initialization

Update `src/app/layout.js`:

```javascript
import { startWorkers } from '@/lib/notes/workers/start-workers';

if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  startWorkers().catch(err => {
    console.error('Failed to start workers:', err);
  });
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

Create `src/lib/notes/workers/start-workers.ts`:

```typescript
import { ocrWorker } from './ocr-worker';

let started = false;

export async function startWorkers() {
  if (started) return;
  started = true;

  console.log('[Workers] Starting OCR worker...');
  await ocrWorker.waitUntilReady();
  console.log('[Workers] OCR worker ready and listening');
}
```

## 9. Test It

```bash
# 1. Start Redis
redis-server

# 2. Run app
npm run dev

# 3. Upload a PDF via /notes
# You should see:
# - File uploaded to S3
# - Attachment created in DB with status='pending'
# - Job enqueued to BullMQ
# - Worker processes OCR
# - Status updates to 'completed'
# - Embeddings generated

# 4. Check status
curl http://localhost:3000/api/notes/{noteId}/processing-status

# 5. Search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "search term", "type": "fts"}'
```

## Next Steps

1. **Implement search endpoint** (`/api/search`) with FTS + semantic options
2. **Add processing-status endpoint** for UI progress tracking
3. **Consolidate auth** (remove custom JWT)
4. **Test full flow** with multiple PDFs
5. **Deploy to staging** and run regression tests
6. **Migrate production data** once verified

See `IMPLEMENTATION_CHECKLIST.md` for complete phase-by-phase guide.
