# AI Settings & Vault Import/Export

## Overview

Two features for the settings page:

1. **AI Settings** - model selector (Kimi K2.5, sole option) and BYOK stub (coming soon)
2. **Vault Import/Export** - zip-based import/export with folder hierarchy preservation, full RAG pipeline, running on existing ECS/Fargate infrastructure

## 1. AI Settings Section

### What it does

Replaces the "AI settings coming soon" placeholder in `src/app/settings/page.jsx` (lines 877-895) with:

- **Model selector**: styled `<select>` with one option "Kimi K2.5". Description text: "Powers chat, search, and study features." Read-only feel since there's only one option.
- **BYOK section**: heading "Bring Your Own Key" with a "Coming Soon" badge. Description: "Use your own API key for supported providers." Disabled input fields for API key and API endpoint shown but grayed out.

### What it doesn't do

- No backend changes. Model is server-configured via `LLM_MODEL`, `LLM_API_URL`, `LLM_API_KEY` env vars.
- No per-user model persistence yet. That comes when BYOK ships (adds `llm_model`, `llm_api_key`, `llm_api_url` to `app.login`, chat route reads per-user overrides).

### UI pattern

Follows existing settings section layout: 3-column grid on desktop (1/3 label+description, 2/3 form content). Same `inputClass` styling, same disabled opacity pattern used by light/system theme toggles.

## 2. Vault Import/Export

### Architecture

Reuses the existing Canvas import infrastructure:

- **SQS queue**: same `SQS_QUEUE_URL` with new message types `vault-import` and `vault-export`
- **ECS/Fargate worker**: same `canvas-import-worker` service, worker-entry.js already has stubs for these message types
- **Job tracking**: reuses `app.canvas_import_jobs` table with new `type` column
- **Zip library**: `fflate` - pure JS, ~15KB, streaming capable, 10-50x faster than JSZip

### Database changes

Add to `app.canvas_import_jobs`:

- `type TEXT NOT NULL DEFAULT 'canvas'` - distinguishes canvas/import/export jobs
- `output_s3_key TEXT` - S3 key for export zip result
- `input_s3_key TEXT` - S3 key for uploaded import zip

### Import flow

1. **Upload**: user selects .zip file via file input in settings
2. **Presigned upload**: `POST /api/vault/import` returns a presigned S3 PUT URL. Browser uploads directly to S3 (max 500MB).
3. **Job creation**: after upload completes, `POST /api/vault/import/start` creates job record + sends SQS message `{ type: 'vault-import', jobId, userId, s3Key }`
4. **ECS scale-up**: calls `ensureWorkerRunning()` (existing `src/lib/ecs.ts`)
5. **Worker processing** (`src/lib/vault/import-worker.js`):
   - downloads zip from S3
   - decompresses with `fflate.unzipSync()` (fine for <= 500MB)
   - iterates entries, skipping `__MACOSX/`, `.DS_Store`, etc.
   - for each directory: calls generic `findOrCreateFolder()` (new wrapper around canvas-folders.js logic without canvas-specific IDs)
   - for each file: `createNote()`, upload to S3, run `processRagPipeline()` for PDFs/docs/text
   - uses `pooled()` concurrency (5 files at a time)
   - updates job status throughout
6. **Progress polling**: frontend polls `GET /api/vault/import/status?jobId=...`
7. **Email notification**: when job completes, sends email via SES with "Your vault import is complete" message

### Export flow

1. **Trigger**: user clicks "Export vault" button
2. **Job creation**: `POST /api/vault/export` creates job + sends SQS `{ type: 'vault-export', jobId, userId }`
3. **ECS scale-up**: `ensureWorkerRunning()`
4. **Worker processing** (`src/lib/vault/export-worker.js`):
   - queries `app.tree_items` joined with `app.notes` to get full folder hierarchy
   - builds a path map: `{ noteId -> 'Folder/Subfolder/file.pdf' }`
   - for each note:
     - if `s3_key` exists: downloads file from S3, adds to zip at the computed path
     - if text note (no s3_key, has content): writes `{title}.md` at the computed path
     - skips deleted notes (`deleted != 0`)
   - builds zip with `fflate.zipSync()` or streaming `Zip` for larger vaults
   - uploads zip to S3 at `exports/{userId}/{jobId}/vault-export.zip`
   - generates 24-hour presigned download URL
   - updates job with `output_s3_key` and download URL
5. **Progress polling**: frontend polls `GET /api/vault/export/status?jobId=...`
6. **Download**: when complete, frontend gets presigned URL and triggers download
7. **Email notification**: sends email with download link

### Supported file types for import

Same as Canvas worker (`PROCESSABLE_TYPES`):

- PDF, DOCX, DOC, PPTX, PPT
- Markdown (.md), Plain text (.txt)
- Images and other files: stored in S3 but no RAG processing

### Zip structure conventions

**Import** expects:

```
vault.zip/
  Folder Name/
    Subfolder/
      lecture-notes.md
      slides.pdf
    assignment.docx
  standalone-note.md
```

**Export** produces the same structure, mirroring the user's tree hierarchy.

Ignored during import: `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `.git/`, `node_modules/`

### File structure

```
src/lib/vault/
  import-worker.js     # zip import processing logic
  export-worker.js     # zip export processing logic
  tree-builder.js      # shared: folder hierarchy <-> zip path mapping

src/app/api/vault/
  import/route.ts      # POST: presigned upload URL
  import/start/route.ts # POST: create job after upload
  export/route.ts      # POST: initiate export job
  status/route.ts      # GET: poll job status (works for both import/export)
```

### Worker entry integration

In `src/lib/canvas/worker-entry.js`, replace the stubs:

```js
case 'vault-import':
  await processVaultImport(body);
  break;
case 'vault-export':
  await processVaultExport(body);
  break;
```

### Settings UI

Replaces the disabled "Import (Coming soon)" and "Export (Coming soon)" buttons in `src/app/settings/page.jsx` (lines 898-947) with:

**Import section**:

- file input accepting `.zip` (max 500MB)
- upload progress bar during S3 upload
- processing status with file count progress (e.g., "Processing 15/47 files...")
- completion message with summary

**Export section**:

- "Export vault" button
- processing status indicator
- download button when complete (presigned URL, 24h expiry)

Both sections show the last job status if one exists (polling on mount).

### Error handling

- failed file imports: logged per-file, don't block other files (same as Canvas)
- zip corruption: caught during unzip, job marked as failed with descriptive error
- S3 upload failures: presigned URL expiry (15 min), frontend shows retry option
- worker timeout: stuck job detection already exists (1 hour threshold)

### Performance expectations (500MB vault ceiling)

- **Export**: 30-60 seconds for typical vaults
- **Import (markdown only)**: 1-2 minutes
- **Import (mixed with PDFs)**: 5-15 minutes depending on OCR load
- Memory: `unzipSync` on 500MB needs ~1-1.5GB RAM. Fargate container at 2GB is sufficient.

### Security

- presigned URLs scoped to user's S3 prefix
- job ownership validated on all status endpoints
- zip bomb protection: reject if decompressed size > 2GB or entry count > 10,000
- path traversal protection: sanitize zip entry paths (no `../`)
