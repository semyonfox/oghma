# OghmaNotes Storage Consolidation - Implementation Checklist

## Quick Reference

- **Duration:** ~4-5 weeks
- **Impact:** Eliminates dual-storage problem, enables OCR/RAG pipeline, single source of truth
- **Risk:** Low (can be done in staging first, data migration is traceable)
- **Dependencies:** BullMQ, Redis, pgvector extension

---

## Phase 1: Schema & Cleanup (Week 1) ⏱️

### Database Migrations
- [ ] Create migration `006_add_processing_pipeline_columns.sql`
  - Add columns to `app.notes`:
    ```sql
    content TEXT,
    extracted_text_raw TEXT,
    extracted_text_processed TEXT,
    processing_status VARCHAR DEFAULT 'pending',
    processing_error TEXT,
    ocr_job_id VARCHAR,
    ocr_completed_at TIMESTAMPTZ,
    primary_attachment_id UUID,
    embedding vector(1536),
    embedding_model VARCHAR,
    embedding_updated_at TIMESTAMPTZ
    ```
  - Add columns to `app.attachments`:
    ```sql
    processing_status VARCHAR DEFAULT 'pending',
    ocr_job_id VARCHAR,
    extracted_text_s3_key TEXT
    ```

- [ ] Create migration `007_add_search_indexes.sql`
  - Full-text search index on `extracted_text_processed || content`
  - HNSW vector index on `embedding`
  - Status index on `processing_status`

- [ ] Run migrations locally and test
  - `npm run db:migrate`
  - Verify indexes created: `\d app.notes`

### Dependencies & Configuration
- [ ] Remove Prisma (dead code):
  - `npm uninstall prisma @prisma/client`
  - Delete `prisma/` directory
  - Remove from `package.json` scripts: `db:migrate`, `db:generate`, `db:seed`, `db:reset`

- [ ] Install BullMQ + Redis:
  ```bash
  npm install bullmq redis
  npm install --save-dev @types/bullmq
  ```

- [ ] Install text processing libraries:
  ```bash
  npm install stopword tesseract.js pdf-parse
  npm install --save-dev @types/tesseract.js
  ```

- [ ] Verify pgvector installed:
  ```bash
  # In PostgreSQL
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

### Authentication Consolidation
- [ ] Delete custom JWT auth code:
  - Remove `/api/auth/login` route
  - Remove `/api/auth/register` route  
  - Keep custom JWT only in `src/lib/auth.js` for legacy users (optional migration)

- [ ] Use next-auth credentials provider only:
  - Keep `src/auth.config.ts` with Credentials provider
  - Remove `allowDangerousEmailAccountLinking` from all 4 OAuth providers (Google, GitHub, Azure, Apple)
  
- [ ] Update middleware to use only next-auth:
  ```typescript
  // middleware.ts - simplify to check next-auth only
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  ```

- [ ] Test auth flow end-to-end (login, logout, OAuth)

### Code Cleanup
- [ ] Delete legacy storage abstraction:
  - Remove `src/lib/storage/base.ts` (no longer needed)
  - Remove S3 sync code:
    - `src/lib/notes/sync/auto-sync.js`
    - `src/lib/notes/migrations/sync-s3-to-pg.js`

- [ ] Delete dead code:
  - `src/context/AuthProvider.js` (unused)
  - Old `database/schema.sql` (rename to `schema-deprecated.sql`)

- [ ] Clean up ESLint warnings:
  ```bash
  npm run lint -- --fix
  ```
  - Fix React hooks errors manually:
    - `src/app/login/page.js:26` - remove useEffect setState
    - `src/app/reset-password/page.jsx:17` - fix setState pattern

- [ ] Run linter again to confirm clean:
  ```bash
  npm run lint
  ```

---

## Phase 2: API Refactor (Week 2-3) 🔄

### Upload Endpoint
- [ ] Update `/api/upload/route.ts`:
  ```typescript
  // Add at top of POST/GET handlers:
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Fix noteId default:
  const noteId = formData.get('noteId') as string;
  if (!noteId || !isValidUUID(noteId)) {
    return NextResponse.json({ error: 'Valid noteId required' }, { status: 400 });
  }
  ```

- [ ] Update to insert attachment record:
  ```typescript
  // Instead of uploading content directly, use:
  const attachment = await db`
    INSERT INTO app.attachments (note_id, user_id, filename, s3_key, mime_type, file_size, processing_status)
    VALUES (${noteId}, ${session.user_id}, ...)
    RETURNING id
  `;
  ```

- [ ] Enqueue BullMQ job:
  ```typescript
  const ocrQueue = await getOCRQueue();
  const job = await ocrQueue.add('ocr', { attachmentId, noteId, s3Key, ... });
  ```

- [ ] Test with sample PDF/image upload

### Notes CRUD Endpoints
- [ ] Update `GET /api/notes/{id}`:
  - Fetch from PostgreSQL only
  - Remove all S3 calls
  - Return `extracted_text_processed` if available

- [ ] Update `PUT /api/notes/{id}`:
  - Update `app.notes.content` (Markdown)
  - Update tree via `app.tree_items` only
  - Remove S3 writes

- [ ] Update `DELETE /api/notes/{id}`:
  - Soft-delete in PostgreSQL only
  - Don't delete from S3 yet

- [ ] Test CRUD operations locally

### Tree Operations
- [ ] Update `GET /api/tree`:
  - Fetch from `app.tree_items` only
  - Remove S3 calls

- [ ] Update `POST /api/tree`:
  - All tree mutations go to PostgreSQL
  - Remove S3 sync

- [ ] Update `POST /api/tree/move`:
  - Move operations in PostgreSQL only

- [ ] Test tree navigation (expand, collapse, move)

### Search Endpoint (New)
- [ ] Create `/api/search/route.ts`:
  ```typescript
  // POST /api/search
  // { query: string, type: 'fts' | 'semantic', limit?: number }
  
  // FTS implementation
  // Semantic implementation (requires query embedding generation)
  ```

- [ ] Implement full-text search:
  ```sql
  SELECT note_id, title, ts_rank(...) AS rank
  FROM app.notes
  WHERE to_tsvector('english', extracted_text_processed || content) @@ plainto_tsquery(...)
  ORDER BY rank DESC
  ```

- [ ] Implement semantic search (if embedding available):
  ```sql
  SELECT note_id, title, embedding <-> query_embedding AS distance
  FROM app.notes
  WHERE embedding IS NOT NULL
  ORDER BY distance
  LIMIT 10
  ```

- [ ] Test both search modes with sample data

### Processing Status Endpoint (New)
- [ ] Create `/api/notes/{noteId}/processing-status/route.ts`:
  - Fetch attachments with status
  - Get BullMQ job status from queue
  - Return combined status info

- [ ] Test progress indicator updates

### Settings Endpoint
- [ ] Update `GET/POST /api/settings`:
  - Store in `app.notes` (settings folder) instead of S3
  - Or: Create `app.user_settings` table

- [ ] Remove all S3 calls from settings

### Trash Endpoint
- [ ] Update `GET /api/trash`:
  ```sql
  SELECT * FROM app.notes
  WHERE user_id = ${userId}
    AND (deleted = 1 OR deleted_at IS NOT NULL)
  ```

- [ ] Remove S3 calls from trash operations

---

## Phase 3: BullMQ Setup (Week 3-4) 🚀

### Redis Setup
- [ ] Install Redis locally (dev) or ensure Redis available (prod):
  - Mac: `brew install redis`
  - Linux: `sudo apt-get install redis-server`
  - Docker: `docker run -d -p 6379:6379 redis:latest`

- [ ] Add Redis connection to env:
  ```
  REDIS_URL=redis://localhost:6379
  ```

- [ ] Test connection:
  ```bash
  redis-cli ping  # Should return PONG
  ```

### BullMQ Queue Setup
- [ ] Create `src/lib/notes/workers/queue.ts`:
  ```typescript
  import { Queue, Worker } from 'bullmq';
  import Redis from 'redis';
  
  const connection = new Redis(process.env.REDIS_URL);
  export const ocrQueue = new Queue('ocr', { connection });
  
  export async function getOCRQueue() {
    return ocrQueue;
  }
  ```

- [ ] Create `src/lib/notes/workers/ocr-worker.ts`:
  - Implement OCR processing (Tesseract or cloud API)
  - Text processing (stopword removal, lowercase, punctuation removal)
  - Embedding generation
  - Database updates
  - Error handling with retries

- [ ] Implement worker initialization:
  ```typescript
  const worker = new Worker('ocr', processOCRJob, { 
    connection,
    concurrency: 3,  // 3 concurrent OCR jobs
  });
  ```

### Embedding Generation
- [ ] Set up OpenAI integration:
  ```bash
  npm install openai
  ```

- [ ] Create `src/lib/embeddings-provider.ts`:
  ```typescript
  export async function generateEmbedding(text: string): Promise<number[]> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }
  ```

- [ ] Add to env:
  ```
  OPENAI_API_KEY=sk-...
  ```

### Text Processing
- [ ] Create `src/lib/text-processing.ts`:
  ```typescript
  import { removeStopwords, stopwords } from 'stopword';
  
  export function processExtractedText(raw: string): string {
    // Lowercase, remove punctuation, stopwords
  }
  ```

- [ ] Test text processing with sample OCR output

### Worker Process
- [ ] Create worker startup in `src/lib/notes/workers/start-workers.ts`:
  ```typescript
  import { worker as ocrWorker } from './ocr-worker';
  
  export async function startWorkers() {
    console.log('[Workers] Starting OCR worker...');
    await ocrWorker.waitUntilReady();
    console.log('[Workers] OCR worker ready');
  }
  ```

- [ ] Integrate into app startup:
  ```typescript
  // src/app/layout.js or instrumentation.ts
  if (process.env.NODE_ENV !== 'test') {
    startWorkers().catch(console.error);
  }
  ```

### Job Monitoring (Optional but Recommended)
- [ ] Install Bull Board (UI for monitoring):
  ```bash
  npm install @bull-board/express @bull-board/ui
  ```

- [ ] Create dashboard:
  ```typescript
  // src/app/api/admin/jobs/route.ts
  import { createBullBoard } from '@bull-board/express';
  ```

- [ ] Access at `/api/admin/jobs` (add auth check!)

- [ ] Test job submission and monitoring

---

## Phase 4: Data Migration (Week 4-5) 📊

### Backup Everything
- [ ] Backup PostgreSQL:
  ```bash
  pg_dump oghmanotes > backup-$(date +%s).sql
  ```

- [ ] Backup S3 data:
  ```bash
  aws s3 sync s3://bucket/oghmanotes ./s3-backup/
  ```

### Build Migration Script
- [ ] Create `scripts/migrate-s3-to-pg.ts`:
  1. Fetch all notes from S3
  2. Fetch all tree from S3
  3. Fetch all settings from S3
  4. Insert into PostgreSQL
  5. Verify consistency
  6. Report on success/failures

- [ ] Test migration locally:
  ```bash
  npm run migrate:s3-to-pg
  ```

- [ ] Verify data:
  ```sql
  SELECT COUNT(*) FROM app.notes;
  SELECT COUNT(*) FROM app.tree_items;
  ```

- [ ] Check for missing/duplicate data

### Staging Deployment
- [ ] Deploy to staging environment
- [ ] Run migration script in staging
- [ ] Run full regression tests:
  - User can login
  - User can create note
  - User can upload PDF
  - User can search notes
  - User can view tree
  - User can move notes

### Production Migration
- [ ] Schedule maintenance window (low-traffic time)
- [ ] Notify users (if needed)
- [ ] Run final backup
- [ ] Run migration script on production
- [ ] Verify migration completeness:
  ```sql
  SELECT 'notes' AS table_name, COUNT(*) FROM app.notes
  UNION ALL
  SELECT 'tree_items', COUNT(*) FROM app.tree_items
  UNION ALL
  SELECT 'attachments', COUNT(*) FROM app.attachments;
  ```

- [ ] Monitor for errors in logs

### Rollback Plan (If Needed)
- [ ] If migration fails:
  1. Stop app
  2. Restore from backup: `psql oghmanotes < backup-*.sql`
  3. Restart app
  4. Investigate issue
  5. Fix and retry in staging first

---

## Phase 5: Cleanup (Week 5) 🎯

### Remove Legacy Code
- [ ] Delete S3 storage abstraction:
  - Remove `src/lib/storage/base.ts`
  - Remove `src/lib/storage/str.ts` (if exists)
  - Keep only `src/lib/storage/init.ts` and `s3.ts`

- [ ] Delete migration code:
  - Remove `src/lib/notes/sync/`
  - Remove `src/lib/notes/migrations/`

- [ ] Clean up API routes:
  - Remove old `/api/settings` if changed
  - Remove `/api/trash` if consolidating
  - Keep only what's in Phase 2

### Archive S3 Data
- [ ] Keep S3 binaries (PDFs, images) for safety
- [ ] Delete S3 JSON files (notes, tree, settings)
- [ ] Keep S3 audit trail (raw OCR outputs)
  ```bash
  # Delete old notes/tree/settings but keep attachments and ocr-raw
  aws s3 rm s3://bucket/oghmanotes/notes/index.json
  aws s3 rm s3://bucket/oghmanotes/tree/tree.json
  aws s3 rm s3://bucket/oghmanotes/settings/ --recursive
  ```

### Final Testing
- [ ] Run full regression test suite:
  - [ ] Auth (login, logout, OAuth)
  - [ ] Notes (create, read, update, delete)
  - [ ] Upload (PDF, image, error cases)
  - [ ] Search (FTS, semantic)
  - [ ] Tree (navigate, expand, collapse, move)
  - [ ] Processing (OCR status, embeddings)
  - [ ] Trash (soft delete, restore)

- [ ] Performance testing:
  - [ ] Search query performance (with 1000+ notes)
  - [ ] Upload speed
  - [ ] Tree navigation speed

- [ ] Error handling:
  - [ ] Network failure during upload
  - [ ] Invalid file type
  - [ ] Missing noteId
  - [ ] Concurrent uploads

### Documentation
- [ ] Update README:
  - Remove Prisma references
  - Update architecture section
  - Add OCR/RAG pipeline description
  - Add search documentation

- [ ] Update AGENTS.md:
  - Update database section
  - Document new processing pipeline
  - Update API endpoint docs

- [ ] Create RUN_BOOK.md for ops:
  - How to check OCR job status
  - How to retry failed jobs
  - How to clear Redis cache
  - Monitoring checklist

### Celebrate 🎉
- [ ] Verify no data loss
- [ ] Confirm all tests pass
- [ ] Share with team
- [ ] Archive S3 data separately (for recovery)
- [ ] Close technical debt ticket

---

## Success Criteria

After Phase 5, you should have:

✅ **Single Source of Truth**
- All data in PostgreSQL
- S3 has only binaries + audit trail
- No more sync complexity

✅ **Consolidated Auth**
- Only next-auth (no custom JWT)
- OAuth properly configured (no dangerous email linking)
- Session management clean

✅ **OCR Pipeline**
- BullMQ queue working
- Workers processing PDFs/images
- Text extraction complete

✅ **Search Capability**
- Full-text search working
- Semantic search working
- RAG-ready (embeddings available)

✅ **Code Quality**
- No Prisma dead code
- No legacy S3 sync code
- All tests passing
- No ESLint errors

---

## Troubleshooting

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping

# If not installed:
brew install redis  # Mac
sudo apt-get install redis-server  # Ubuntu
docker run -d -p 6379:6379 redis:latest  # Docker
```

### Migration Failures
```bash
# Check what failed
SELECT COUNT(*) FROM app.notes WHERE created_at > NOW() - INTERVAL '1 day';

# Revert if needed
psql oghmanotes < backup-*.sql
```

### OCR Worker Not Starting
```bash
# Check logs
tail -f ~/.npm-logs/ocr-worker.log

# Verify Redis connection
redis-cli INFO server

# Test worker locally
npm run dev  # Should log "[Workers] OCR worker ready"
```

### Search Not Working
```sql
-- Check if index exists
\d app.notes

-- Test FTS query
SELECT * FROM app.notes 
WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'test');
```

---

## Timeline & Effort

| Phase | Duration | Effort | Risk |
|-------|----------|--------|------|
| 1. Schema & Cleanup | 1 week | 8h | Low |
| 2. API Refactor | 2-3 weeks | 20h | Low |
| 3. BullMQ Setup | 1-2 weeks | 16h | Medium |
| 4. Data Migration | 1 week | 12h | Medium |
| 5. Cleanup & Testing | 1 week | 12h | Low |
| **Total** | **4-5 weeks** | **68h** | **Low-Medium** |

**Recommendation:** Complete one phase before starting next. Deploy to staging after each phase.
