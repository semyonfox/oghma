# AI Settings & Vault Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI Settings section (model selector + BYOK stub) and full vault import/export (zip-based, streaming, with RAG pipeline) to the settings page, reusing the existing ECS/Fargate worker infrastructure.

**Architecture:** AI Settings is a frontend-only stub (model selector shows Kimi K2.5, BYOK fields disabled with "Coming Soon" badge). Vault import/export uses the same SQS + ECS worker as Canvas imports — new message types `vault-import` and `vault-export` route to dedicated worker modules. Import streams zip from S3 via fflate's `Unzip`, creates folders/notes in the tree, runs the full RAG pipeline. Export queries the user's tree, streams files from S3, builds a zip via fflate's `Zip` piped into S3 multipart upload. Both send email notifications on completion.

**Tech Stack:** Next.js App Router, React, Tailwind, Zustand, fflate (streaming zip), @aws-sdk/client-s3 (multipart upload), @aws-sdk/s3-request-presigner, postgres.js, nodemailer (SES), SQS, ECS/Fargate

---

### Task 1: AI Settings UI

Replace the "AI settings coming soon" placeholder in the settings page with a model selector and BYOK stub.

**Files:**

- Modify: `src/app/settings/page.jsx:877-895`

- [ ] **Step 1: Replace the AI Settings placeholder**

In `src/app/settings/page.jsx`, replace lines 877-895 (the AI Settings section) with the real UI. Find and replace this block:

```jsx
{
  /* ── AI Settings ── */
}
<div id="ai" className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3">
  <div>
    <h2 className="text-base/7 font-semibold text-text">{t("AI Settings")}</h2>
    <p className="mt-1 text-sm/6 text-text-tertiary">
      {t("Configure AI-powered features for your notes.")}
    </p>
  </div>

  <div className="md:col-span-2">
    <p className="text-sm text-text-tertiary">
      {t("AI settings coming soon.")}
    </p>
  </div>
</div>;
```

With:

```jsx
{
  /* ── AI Settings ── */
}
<div id="ai" className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3">
  <div>
    <h2 className="text-base/7 font-semibold text-text">{t("AI Settings")}</h2>
    <p className="mt-1 text-sm/6 text-text-tertiary">
      {t("Configure AI-powered features for your notes.")}
    </p>
  </div>

  <div className="md:col-span-2">
    <div className="space-y-8">
      {/* model selector */}
      <div>
        <label
          htmlFor="ai-model"
          className="block text-sm/6 font-medium text-text"
        >
          {t("Model")}
        </label>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("Powers chat, search, and study features.")}
        </p>
        <div className="mt-2 sm:max-w-xs">
          <select
            id="ai-model"
            className={cn(inputClass, "appearance-auto")}
            defaultValue="kimi-k2.5"
            disabled
          >
            <option value="kimi-k2.5">Kimi K2.5</option>
          </select>
        </div>
      </div>

      {/* BYOK stub */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2">
          <h3 className="text-sm/6 font-medium text-text">
            {t("Bring Your Own Key")}
          </h3>
          <span className="inline-flex items-center rounded-md bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/20">
            {t("Coming Soon")}
          </span>
        </div>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("Use your own API key for supported providers.")}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:max-w-xl sm:grid-cols-6">
          <div className="col-span-full">
            <label
              htmlFor="byok-api-key"
              className="block text-sm/6 font-medium text-text opacity-50"
            >
              {t("API Key")}
            </label>
            <div className="mt-2">
              <input
                id="byok-api-key"
                type="password"
                placeholder="sk-..."
                disabled
                className={cn(
                  inputClass,
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              />
            </div>
          </div>
          <div className="col-span-full">
            <label
              htmlFor="byok-endpoint"
              className="block text-sm/6 font-medium text-text opacity-50"
            >
              {t("API Endpoint")}
            </label>
            <div className="mt-2">
              <input
                id="byok-endpoint"
                type="url"
                placeholder="https://api.example.com/v1"
                disabled
                className={cn(
                  inputClass,
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>;
```

- [ ] **Step 2: Verify the UI renders correctly**

Open `http://localhost:3000/settings` in the browser, scroll to the AI Settings section. Verify:

- Model selector shows "Kimi K2.5" and is disabled (grayed out)
- "Bring Your Own Key" heading has a "Coming Soon" badge
- API Key and API Endpoint inputs are visible but disabled/grayed out
- Layout matches the 3-column grid pattern of other settings sections

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.jsx
git commit -m "feat(settings): add AI model selector and BYOK coming-soon stub"
```

---

### Task 2: Install fflate

Install the streaming zip library needed for vault import/export.

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install fflate**

```bash
npm install fflate
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const f = require('fflate'); console.log('fflate loaded, has Zip:', typeof f.Zip === 'function', 'has Unzip:', typeof f.Unzip === 'function')"
```

Expected: `fflate loaded, has Zip: true, has Unzip: true`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fflate for streaming zip support"
```

---

### Task 3: Database Migration — Extend canvas_import_jobs

Add `type`, `output_s3_key`, `input_s3_key`, and `download_url` columns to support vault import/export jobs.

**Files:**

- Create: `database/migrations/005_vault_job_columns.sql`

- [ ] **Step 1: Write the migration SQL**

Create `database/migrations/005_vault_job_columns.sql`:

```sql
-- add vault import/export support to the jobs table
-- type: 'canvas' (default), 'vault-import', 'vault-export'
-- input_s3_key: S3 key of uploaded zip for import
-- output_s3_key: S3 key of generated zip for export
-- download_url: presigned download URL for completed exports

ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'canvas',
  ADD COLUMN IF NOT EXISTS input_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS output_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;
```

- [ ] **Step 2: Run the migration against the dev database**

```bash
psql "$DATABASE_URL" -f database/migrations/005_vault_job_columns.sql
```

Expected: `ALTER TABLE` with no errors.

- [ ] **Step 3: Verify columns exist**

```bash
psql "$DATABASE_URL" -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'canvas_import_jobs' AND column_name IN ('type', 'input_s3_key', 'output_s3_key', 'download_url');"
```

Expected: 4 rows showing the new columns.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/005_vault_job_columns.sql
git commit -m "feat(db): add vault job columns to canvas_import_jobs"
```

---

### Task 4: Email Notification Helper

Add a vault-specific email function to the existing email utility.

**Files:**

- Modify: `src/lib/email.js`

- [ ] **Step 1: Add vault email functions**

At the end of `src/lib/email.js` (before the comment block), add:

```js
export async function sendVaultImportCompleteEmail(
  email,
  { totalFiles, totalFolders, failedFiles },
) {
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      "[email] SES from-email not configured, skipping vault import notification",
    );
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const hasFailures = failedFiles > 0;

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Your vault import is complete",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vault Import Complete</h2>
        <p>Your vault has been imported successfully.</p>
        <ul style="line-height: 1.8;">
          <li><strong>${totalFolders}</strong> folders created</li>
          <li><strong>${totalFiles}</strong> files processed</li>
          ${hasFailures ? `<li style="color: #e53e3e;"><strong>${failedFiles}</strong> files failed</li>` : ""}
        </ul>
        <a href="${baseUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 16px;">
          Open OghmaNote
        </a>
      </div>
    `,
    text: `Vault Import Complete\n\n${totalFolders} folders created, ${totalFiles} files processed${hasFailures ? `, ${failedFiles} failed` : ""}.\n\nOpen OghmaNote: ${baseUrl}`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(
      "[email] failed to send vault import notification:",
      err.message,
    );
  }
}

export async function sendVaultExportCompleteEmail(email, { downloadUrl }) {
  const fromEmail =
    process.env.AWS_SES_FROM_EMAIL || process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      "[email] SES from-email not configured, skipping vault export notification",
    );
    return;
  }

  const mailOptions = {
    from: fromEmail,
    to: email,
    subject: "Your vault export is ready",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vault Export Ready</h2>
        <p>Your vault export has been generated and is ready to download.</p>
        <a href="${downloadUrl}"
           style="background-color: #4299e1; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 16px;">
          Download Vault
        </a>
        <p style="margin-top: 20px; color: #666;">This download link expires in 24 hours.</p>
      </div>
    `,
    text: `Vault Export Ready\n\nDownload your vault: ${downloadUrl}\n\nThis link expires in 24 hours.`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(
      "[email] failed to send vault export notification:",
      err.message,
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email.js
git commit -m "feat(email): add vault import/export notification emails"
```

---

### Task 5: Tree Builder — Shared Folder/Path Utilities

Create a shared utility for mapping between zip paths and the note tree hierarchy. This is used by both import and export workers.

**Files:**

- Create: `src/lib/vault/tree-builder.js`

- [ ] **Step 1: Create the tree-builder module**

Create `src/lib/vault/tree-builder.js`:

```js
/**
 * Vault tree builder — maps between zip paths and note tree hierarchy.
 * Shared by import-worker and export-worker.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { addNoteToTree } from "../notes/storage/pg-tree.js";

// paths to skip during import
const IGNORED_PATHS = [
  "__MACOSX/",
  ".DS_Store",
  "Thumbs.db",
  ".git/",
  "node_modules/",
];

/**
 * Check if a zip entry path should be ignored.
 */
export function shouldIgnore(entryPath) {
  const normalized = entryPath.replace(/\\/g, "/");
  return IGNORED_PATHS.some(
    (p) => normalized.includes(p) || normalized.startsWith(p),
  );
}

/**
 * Sanitize a zip entry path — strip leading slashes, prevent traversal.
 * Returns null if the path is unsafe.
 */
export function sanitizePath(entryPath) {
  let cleaned = entryPath.replace(/\\/g, "/");
  // strip leading slashes and dots
  cleaned = cleaned.replace(/^[./]+/, "");
  // reject path traversal
  if (cleaned.includes("../") || cleaned.includes("..\\")) return null;
  // reject absolute paths
  if (cleaned.startsWith("/")) return null;
  return cleaned || null;
}

/**
 * Find or create a folder by title under a parent (non-Canvas version).
 * Uses title-based dedup instead of Canvas IDs.
 */
export async function findOrCreateVaultFolder(userId, title, parentId) {
  // check for existing folder with same title under same parent
  const existing = await sql`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = true
      AND n.deleted = 0
      AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0].note_id;

  const noteId = uuidv4();
  try {
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
      VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', true, 0, NOW(), NOW())
    `;
    await addNoteToTree(userId, noteId, parentId ?? null);
    return noteId;
  } catch (err) {
    // concurrent insert — re-fetch
    if (err.code === "23505") {
      const [winner] = await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
        WHERE n.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = true
          AND n.deleted = 0
          AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
        LIMIT 1
      `;
      if (winner) return winner.note_id;
    }
    console.warn(`Failed to create vault folder "${title}": ${err.message}`);
    return parentId;
  }
}

/**
 * Ensure all folders in a path exist, returning the deepest folder's ID.
 * e.g. "Folder/Subfolder/file.pdf" → creates "Folder" and "Subfolder", returns Subfolder's ID.
 *
 * @param {string} userId
 * @param {string} filePath - the full zip entry path (e.g. "A/B/C/file.txt")
 * @param {Map<string, string>} folderCache - maps "A/B" → folderId for dedup
 * @returns {Promise<string|null>} - the parent folder ID for the file, or null if root
 */
export async function ensureFolderPath(userId, filePath, folderCache) {
  const parts = filePath.split("/");
  // last part is the filename, everything before is folders
  const folderParts = parts.slice(0, -1);

  if (folderParts.length === 0) return null; // root-level file

  let parentId = null;
  let pathSoFar = "";

  for (const folderName of folderParts) {
    pathSoFar = pathSoFar ? `${pathSoFar}/${folderName}` : folderName;

    if (folderCache.has(pathSoFar)) {
      parentId = folderCache.get(pathSoFar);
      continue;
    }

    parentId = await findOrCreateVaultFolder(userId, folderName, parentId);
    folderCache.set(pathSoFar, parentId);
  }

  return parentId;
}

/**
 * Build a path map from the user's tree for export.
 * Returns a Map of noteId → full/path/filename.ext
 *
 * @param {string} userId
 * @returns {Promise<Map<string, { path: string, title: string, s3Key: string|null, content: string|null }>>}
 */
export async function buildExportPathMap(userId) {
  // get all non-deleted tree items with note data
  const rows = await sql`
    SELECT
      t.note_id,
      t.parent_id,
      n.title,
      n.s3_key,
      n.content,
      n.is_folder
    FROM app.tree_items t
    JOIN app.notes n ON n.note_id = t.note_id AND n.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND n.deleted = 0
    ORDER BY n.title
  `;

  // build parent lookup
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.note_id, row);
  }

  // resolve full path for each note by walking up the parent chain
  function getPath(noteId, visited = new Set()) {
    if (visited.has(noteId)) return ""; // cycle protection
    visited.add(noteId);
    const node = byId.get(noteId);
    if (!node) return "";
    const parentPath = node.parent_id ? getPath(node.parent_id, visited) : "";
    return parentPath ? `${parentPath}/${node.title}` : node.title;
  }

  const exportMap = new Map();
  for (const row of rows) {
    if (row.is_folder) continue; // only export files
    const path = getPath(row.note_id);
    if (!path) continue;

    // for text notes without s3_key, ensure .md extension
    let finalPath = path;
    if (!row.s3_key && row.content !== null) {
      if (!finalPath.match(/\.\w+$/)) {
        finalPath += ".md";
      }
    }

    exportMap.set(row.note_id, {
      path: finalPath,
      title: row.title,
      s3Key: row.s3_key,
      content: row.content,
    });
  }

  return exportMap;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/vault/tree-builder.js
git commit -m "feat(vault): add tree-builder for folder/path mapping"
```

---

### Task 6: Vault Import Worker

Create the worker module that processes vault import jobs — streams zip from S3, creates folders/notes, runs RAG pipeline.

**Files:**

- Create: `src/lib/vault/import-worker.js`

- [ ] **Step 1: Create the import worker**

Create `src/lib/vault/import-worker.js`:

```js
/**
 * Vault Import Worker
 * Streams a zip file from S3, creates folders + notes in the user's tree,
 * and runs the full RAG pipeline (OCR, chunking, embeddings) on supported file types.
 *
 * Uses fflate's streaming Unzip for flat ~200MB memory regardless of zip size.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import { AsyncUnzipInflate, Unzip, DecodeUTF8 } from "fflate";
import { chunkText } from "../chunking.ts";
import { embedChunks } from "../embeddings.ts";
import { stripMarkdown } from "../strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { extractWithMarker } from "../ocr.ts";
import {
  shouldIgnore,
  sanitizePath,
  ensureFolderPath,
} from "./tree-builder.js";
import { sendVaultImportCompleteEmail } from "../email.js";

const PROCESSABLE_EXTS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "md",
  "markdown",
  "txt",
]);

const EXT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

const FILE_CONCURRENCY = 5;
const MAX_DECOMPRESSED_SIZE = 20 * 1024 * 1024 * 1024; // 20GB
const MAX_ENTRIES = 50_000;

async function pooled(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p));
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.allSettled(results);
}

function getMimeType(filename) {
  const ext = filename?.toLowerCase().split(".").pop();
  return ext && EXT_MIME[ext] ? EXT_MIME[ext] : null;
}

function isProcessable(filename) {
  const ext = filename?.toLowerCase().split(".").pop();
  return PROCESSABLE_EXTS.has(ext);
}

async function createNote(userId, title, parentId, opts = {}) {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const content = opts.content ?? "";
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, false, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

async function writeEmbeddings(noteId, userId, chunks) {
  const embeddings = await embedChunks(chunks);
  if (embeddings.length === 0) return 0;

  const chunkValues = embeddings.map(({ chunk }) => [noteId, userId, chunk]);
  const chunkRows = await sql`
    INSERT INTO app.chunks (document_id, user_id, text)
    SELECT * FROM UNNEST(
      ${chunkValues.map((v) => v[0])}::uuid[],
      ${chunkValues.map((v) => v[1])}::uuid[],
      ${chunkValues.map((v) => v[2])}::text[]
    ) RETURNING id
  `;
  const embValues = chunkRows.map((row, i) => [
    row.id,
    JSON.stringify(embeddings[i].vector),
  ]);
  await sql`
    INSERT INTO app.embeddings (chunk_id, embedding)
    SELECT * FROM UNNEST(
      ${embValues.map((v) => v[0])}::uuid[],
      ${embValues.map((v) => v[1])}::vector[]
    )
  `;
  return embeddings.length;
}

async function processRagPipeline(
  noteId,
  userId,
  parentFolderId,
  buffer,
  opts,
) {
  const { filename, mimeType } = opts;
  const isText = mimeType?.startsWith("text/");

  let rawText;
  let chunks;

  if (isText) {
    rawText = buffer.toString("utf-8");
    chunks = chunkText(rawText);
  } else {
    const marker = await extractWithMarker(buffer, filename ?? "document.pdf");
    rawText = marker.text;
    chunks = marker.chunks;
  }

  const searchText = stripMarkdown(rawText);

  if (isText) {
    await sql`
      UPDATE app.notes
      SET content = ${rawText}, extracted_text = ${searchText}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    const count = await writeEmbeddings(noteId, userId, chunks);
    console.log(`[vault-import] RAG: ${count} chunks for text note ${noteId}`);
    return;
  }

  // binary docs: create sibling .md note
  const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
  const mdNoteId = await createNote(userId, mdTitle, parentFolderId, {
    content: rawText,
  });
  await sql`
    UPDATE app.notes
    SET extracted_text = ${searchText}, updated_at = NOW()
    WHERE note_id = ${mdNoteId}::uuid
  `;
  const count = await writeEmbeddings(mdNoteId, userId, chunks);
  console.log(
    `[vault-import] RAG: ${count} chunks for MD note ${mdNoteId} (source: ${noteId})`,
  );
}

/**
 * Bounded async queue — bridges fflate's sync callbacks to async processing.
 * The producer (Unzip ondata) pushes entries synchronously.
 * The consumer drains entries with a concurrency limit, releasing buffers
 * after each file so memory stays bounded (~FILE_CONCURRENCY * largest file).
 */
class EntryQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
    this.done = false;
    this._resolve = null;
    this._drainPromise = null;
  }

  push(entry) {
    this.queue.push(entry);
    this._tryDrain();
  }

  _tryDrain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift();
      this.running++;
      entry
        .process()
        .catch(() => {}) // errors handled inside process()
        .finally(() => {
          this.running--;
          entry.buffer = null; // release buffer for GC
          this._tryDrain();
          if (this.done && this.running === 0 && this.queue.length === 0) {
            this._resolve?.();
          }
        });
    }
  }

  // call after extraction is complete, resolves when all processing finishes
  finish() {
    this.done = true;
    if (this.running === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((r) => {
      this._resolve = r;
    });
  }
}

/**
 * Stream zip from S3, process entries as they decompress.
 * Memory stays bounded at ~FILE_CONCURRENCY * largest_file_size.
 */
async function streamAndProcessZip(s3Key, userId, jobId, processEntry) {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");

  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const fullKey = `${prefix}/${s3Key}`;

  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
  });
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
  );
  if (!res.Body) throw new Error(`S3 object not found: ${fullKey}`);

  const entryQueue = new EntryQueue(FILE_CONCURRENCY);
  let entryCount = 0;
  let totalSize = 0;

  return new Promise((resolve, reject) => {
    const unzip = new Unzip((stream) => {
      if (stream.name.endsWith("/")) return;

      entryCount++;
      if (entryCount > MAX_ENTRIES) {
        reject(
          new Error(`Zip bomb protection: more than ${MAX_ENTRIES} entries`),
        );
        return;
      }

      const chunks = [];
      stream.ondata = (err, data, final) => {
        if (err) {
          reject(err);
          return;
        }
        if (data) {
          totalSize += data.length;
          if (totalSize > MAX_DECOMPRESSED_SIZE) {
            reject(
              new Error(
                `Zip bomb protection: decompressed size exceeds ${MAX_DECOMPRESSED_SIZE / (1024 * 1024 * 1024)}GB`,
              ),
            );
            return;
          }
          chunks.push(data);
        }
        if (final) {
          const buffer = Buffer.concat(chunks);
          // push to queue — consumer processes concurrently
          const entry = { path: stream.name, buffer, process: null };
          entry.process = () => processEntry(entry.path, entry.buffer);
          entryQueue.push(entry);
        }
      };
      stream.start();
    });

    unzip.register(AsyncUnzipInflate);

    const readable = Readable.from(res.Body);
    readable.on("data", (chunk) => {
      unzip.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : chunk);
    });
    readable.on("end", () => {
      unzip.push(new Uint8Array(0), true);
      // wait for all queued processing to finish
      entryQueue
        .finish()
        .then(() => resolve(entryCount))
        .catch(reject);
    });
    readable.on("error", reject);
  });
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultImport(msg) {
  const { jobId, userId, s3Key } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting vault import: job=${jobId}`);

  try {
    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}::uuid`;

    const storage = getStorageProvider();
    const folderCache = new Map();
    let totalFiles = 0;
    let totalFolders = 0;
    let failedFiles = 0;

    console.log(`[${ts()}] Streaming zip from S3: ${s3Key}`);

    const entryCount = await streamAndProcessZip(
      s3Key,
      userId,
      jobId,
      async (entryPath, buffer) => {
        const cleanPath = sanitizePath(entryPath);
        if (!cleanPath || shouldIgnore(entryPath)) return;

        const filename = cleanPath.split("/").pop();
        if (!filename) return;

        try {
          const parentId = await ensureFolderPath(
            userId,
            cleanPath,
            folderCache,
          );
          totalFolders = folderCache.size;

          const mimeType = getMimeType(filename);
          const s3FileKey = `vault/${userId}/${jobId}/${cleanPath}`;

          // upload raw file to S3
          await storage.putObject(s3FileKey, buffer, {
            contentType: mimeType || "application/octet-stream",
          });

          // create note
          const noteId = await createNote(userId, filename, parentId, {
            s3Key: s3FileKey,
            content: mimeType?.startsWith("text/")
              ? buffer.toString("utf-8")
              : "",
          });

          // create attachment record
          await sql`
            INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
            VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
                    ${filename}, ${s3FileKey}, ${mimeType || "application/octet-stream"}, ${buffer.length})
          `;

          // RAG pipeline for processable file types
          if (isProcessable(filename)) {
            try {
              await processRagPipeline(noteId, userId, parentId, buffer, {
                filename,
                mimeType,
              });
            } catch (ragErr) {
              console.error(
                `[${ts()}] RAG failed for ${filename}:`,
                ragErr.message,
              );
            }
          }

          totalFiles++;
          // update progress periodically
          if (totalFiles % 10 === 0) {
            await sql`UPDATE app.canvas_import_jobs SET expected_total = ${entryCount || totalFiles}, updated_at = NOW() WHERE id = ${jobId}::uuid`;
          }
          console.log(`[${ts()}] Imported: ${cleanPath}`);
        } catch (err) {
          failedFiles++;
          console.error(
            `[${ts()}] Failed to import ${cleanPath}:`,
            err.message,
          );
        }
      },
    );

    // mark job complete
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', expected_total = ${totalFiles + failedFiles}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;

    // send email notification
    try {
      const [user] =
        await sql`SELECT email FROM app.login WHERE user_id = ${userId}::uuid`;
      if (user?.email) {
        await sendVaultImportCompleteEmail(user.email, {
          totalFiles,
          totalFolders,
          failedFiles,
        });
      }
    } catch (emailErr) {
      console.error(`[${ts()}] Email notification failed:`, emailErr.message);
    }

    console.log(
      `[${ts()}] Vault import complete: ${totalFiles} files, ${totalFolders} folders, ${failedFiles} failures`,
    );
  } catch (error) {
    console.error(`[${ts()}] Vault import failed:`, error);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${error.message}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    throw error;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/vault/import-worker.js
git commit -m "feat(vault): add streaming zip import worker with RAG pipeline"
```

---

### Task 7: Vault Export Worker

Create the worker module that exports a user's vault as a streaming zip uploaded to S3.

**Files:**

- Create: `src/lib/vault/export-worker.js`

- [ ] **Step 1: Create the export worker**

Create `src/lib/vault/export-worker.js`:

```js
/**
 * Vault Export Worker
 * Queries user's tree, streams files from S3, builds a zip via fflate's
 * streaming Zip class, and uploads to S3 via multipart upload.
 */

import sql from "../../database/pgsql.js";
import { Zip, ZipPassThrough, ZipDeflate } from "fflate";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getStorageProvider } from "../storage/init.ts";
import { buildExportPathMap } from "./tree-builder.js";
import { sendVaultExportCompleteEmail } from "../email.js";
import { Readable } from "stream";

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum for S3 multipart

/**
 * Stream zip data into S3 via multipart upload.
 * Collects chunks until they reach MIN_PART_SIZE, then uploads each part.
 */
class S3MultipartZipUploader {
  constructor(s3, bucket, key) {
    this.s3 = s3;
    this.bucket = bucket;
    this.key = key;
    this.uploadId = null;
    this.parts = [];
    this.partNumber = 1;
    this.buffer = [];
    this.bufferSize = 0;
  }

  async init() {
    const res = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        ContentType: "application/zip",
      }),
    );
    this.uploadId = res.UploadId;
  }

  // synchronous — safe to call from fflate's sync ondata callback
  addChunk(data) {
    this.buffer.push(Buffer.from(data));
    this.bufferSize += data.length;
  }

  async flushPart() {
    if (this.bufferSize === 0) return;
    const body = Buffer.concat(this.buffer);
    this.buffer = [];
    this.bufferSize = 0;

    const res = await this.s3.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
        PartNumber: this.partNumber,
        Body: body,
      }),
    );

    this.parts.push({ PartNumber: this.partNumber, ETag: res.ETag });
    this.partNumber++;
  }

  async complete() {
    // flush remaining buffered data
    await this.flushPart();

    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
        MultipartUpload: { Parts: this.parts },
      }),
    );
  }

  async abort() {
    if (this.uploadId) {
      try {
        await this.s3.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: this.key,
            UploadId: this.uploadId,
          }),
        );
      } catch (err) {
        console.error(
          "[vault-export] Failed to abort multipart upload:",
          err.message,
        );
      }
    }
  }
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultExport(msg) {
  const { jobId, userId } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting vault export: job=${jobId}`);

  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
  });
  const outputKey = `${prefix}/exports/${userId}/${jobId}/vault-export.zip`;

  const uploader = new S3MultipartZipUploader(s3, bucket, outputKey);

  try {
    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}::uuid`;

    const storage = getStorageProvider();
    const exportMap = await buildExportPathMap(userId);
    const totalFiles = exportMap.size;

    console.log(`[${ts()}] Found ${totalFiles} files to export`);
    await sql`UPDATE app.canvas_import_jobs SET expected_total = ${totalFiles} WHERE id = ${jobId}::uuid`;

    await uploader.init();

    // build the zip using fflate's streaming Zip
    // ondata is synchronous — buffer chunks, flush async after each file
    const zip = new Zip();
    zip.ondata = (err, data, _final) => {
      if (err) throw err;
      if (data.length > 0) {
        uploader.addChunk(data); // sync buffer
      }
    };

    let processed = 0;

    for (const [noteId, entry] of exportMap) {
      try {
        const { path, s3Key, content } = entry;
        let fileData;

        if (s3Key) {
          // download file from S3
          const fullS3Key = `${prefix}/${s3Key}`;
          const res = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: fullS3Key }),
          );
          const chunks = [];
          for await (const chunk of res.Body) {
            chunks.push(chunk);
          }
          fileData = Buffer.concat(chunks);
        } else if (content !== null && content !== undefined) {
          // text note — write as UTF-8
          fileData = Buffer.from(content, "utf-8");
        } else {
          console.log(
            `[${ts()}] Skipping note ${noteId}: no s3_key and no content`,
          );
          continue;
        }

        // add to zip — use ZipPassThrough for already-compressed files, ZipDeflate for text
        const isText =
          path.endsWith(".md") ||
          path.endsWith(".txt") ||
          path.endsWith(".markdown");
        const zipEntry = isText
          ? new ZipDeflate(path, { level: 6 })
          : new ZipPassThrough(path);

        zip.add(zipEntry);
        zipEntry.push(new Uint8Array(fileData), true);

        // flush buffered zip data to S3 (async — safe here in the for loop)
        if (uploader.bufferSize >= MIN_PART_SIZE) {
          await uploader.flushPart();
        }

        processed++;
        if (processed % 50 === 0) {
          await sql`UPDATE app.canvas_import_jobs SET updated_at = NOW() WHERE id = ${jobId}::uuid`;
          console.log(`[${ts()}] Exported ${processed}/${totalFiles} files`);
        }
      } catch (err) {
        console.error(`[${ts()}] Failed to export ${entry.path}:`, err.message);
        // continue with other files
      }
    }

    // finalize zip
    zip.end();

    // complete the multipart upload (flushes remaining buffer + finalizes)
    await uploader.complete();

    // generate 24-hour presigned download URL
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: outputKey }),
      { expiresIn: 86400 },
    );

    // update job with results
    const outputS3Key = `exports/${userId}/${jobId}/vault-export.zip`;
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete',
          completed_at = NOW(),
          updated_at = NOW(),
          output_s3_key = ${outputS3Key},
          download_url = ${downloadUrl}
      WHERE id = ${jobId}::uuid
    `;

    // send email notification
    try {
      const [user] =
        await sql`SELECT email FROM app.login WHERE user_id = ${userId}::uuid`;
      if (user?.email) {
        await sendVaultExportCompleteEmail(user.email, { downloadUrl });
      }
    } catch (emailErr) {
      console.error(`[${ts()}] Email notification failed:`, emailErr.message);
    }

    console.log(`[${ts()}] Vault export complete: ${processed} files`);
  } catch (error) {
    console.error(`[${ts()}] Vault export failed:`, error);
    await uploader.abort();
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${error.message}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    throw error;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/vault/export-worker.js
git commit -m "feat(vault): add streaming zip export worker with S3 multipart upload"
```

---

### Task 8: Wire Worker Entry

Connect the vault-import and vault-export message types in the existing worker entry point.

**Files:**

- Modify: `src/lib/canvas/worker-entry.js:1-14,82-87`

- [ ] **Step 1: Add imports for vault workers**

In `src/lib/canvas/worker-entry.js`, add the vault worker imports after the existing import on line 13:

After:

```js
import { processImportJob, processExtractionRetry } from "./import-worker.js";
```

Add:

```js
import { processVaultImport } from "../vault/import-worker.js";
import { processVaultExport } from "../vault/export-worker.js";
```

- [ ] **Step 2: Replace the vault-import and vault-export stubs**

In `src/lib/canvas/worker-entry.js`, replace the stub cases (lines 82-87):

Replace:

```js
    case 'vault-export':
      console.log(`[${ts()}] vault-export not yet enabled, skipping`);
      break;
    case 'vault-import':
      console.log(`[${ts()}] vault-import not yet enabled, skipping`);
      break;
```

With:

```js
    case 'vault-export':
      await processVaultExport(body);
      break;
    case 'vault-import':
      await processVaultImport(body);
      break;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvas/worker-entry.js
git commit -m "feat(worker): wire vault-import and vault-export to worker entry"
```

---

### Task 9: Presigned Upload URL API Route

Create the API route that returns a presigned S3 URL for uploading the import zip.

**Files:**

- Create: `src/app/api/vault/import/route.ts`

- [ ] **Step 1: Create the presigned upload route**

Create `src/app/api/vault/import/route.ts`:

```ts
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/vault/import
 *
 * Returns a presigned S3 URL for uploading a zip file.
 * Body: { filename: string, contentLength: number }
 * Response: { uploadUrl, s3Key, uploadId }
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentLength } = await request.json();

    if (!filename?.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip files are accepted" },
        { status: 400 },
      );
    }

    // 10GB max
    if (contentLength && contentLength > 10 * 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10GB)" },
        { status: 400 },
      );
    }

    const uploadId = uuidv4();
    const bucket = process.env.STORAGE_BUCKET;
    const prefix = process.env.STORAGE_PREFIX || "oghma";
    const s3Key = `vault-uploads/${user.user_id}/${uploadId}/${filename}`;
    const fullKey = `${prefix}/${s3Key}`;

    const s3 = new S3Client({
      region: process.env.STORAGE_REGION || "us-east-1",
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey,
        ContentType: "application/zip",
      }),
      { expiresIn: 900 }, // 15 minutes
    );

    return NextResponse.json({ uploadUrl, s3Key, uploadId });
  } catch (err) {
    console.error("vault import presign error:", err);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/vault/import/route.ts
git commit -m "feat(api): add presigned upload URL route for vault import"
```

---

### Task 10: Import Start API Route

Create the route that creates a job record after the zip upload completes and dispatches to SQS.

**Files:**

- Create: `src/app/api/vault/import/start/route.ts`

- [ ] **Step 1: Create the start route**

Create `src/app/api/vault/import/start/route.ts`:

```ts
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";

/**
 * POST /api/vault/import/start
 *
 * Creates a vault-import job after the zip has been uploaded to S3.
 * Body: { s3Key: string }
 * Response: { jobId }
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { s3Key } = await request.json();

    if (!s3Key) {
      return NextResponse.json({ error: "s3Key is required" }, { status: 400 });
    }

    // cancel any existing active vault jobs for this user
    const job = await sql.begin(async (tx) => {
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id}
          AND type = 'vault-import'
          AND status IN ('queued', 'processing')
      `;
      const [inserted] = await tx`
        INSERT INTO app.canvas_import_jobs (user_id, type, input_s3_key, status)
        VALUES (${user.user_id}::uuid, 'vault-import', ${s3Key}, 'queued')
        RETURNING id
      `;
      return inserted;
    });

    const jobId = job.id;

    // dispatch to SQS
    const queueUrl = getCanvasImportQueueUrl();
    try {
      if (queueUrl) {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              type: "vault-import",
              jobId,
              userId: user.user_id,
              s3Key,
            }),
          }),
        );
      }
    } catch (sqsErr) {
      console.error("SQS send failed for vault import:", sqsErr.message);
    }

    // scale up worker
    try {
      await ensureWorkerRunning();
    } catch (ecsErr) {
      console.error("ECS scale-up failed for vault import:", ecsErr.message);
    }

    return NextResponse.json({ jobId });
  } catch (err) {
    console.error("vault import start error:", err);
    return NextResponse.json(
      { error: "Failed to start import" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/vault/import/start/route.ts
git commit -m "feat(api): add vault import start route with SQS dispatch"
```

---

### Task 11: Export API Route

Create the route that initiates a vault export job.

**Files:**

- Create: `src/app/api/vault/export/route.ts`

- [ ] **Step 1: Create the export route**

Create `src/app/api/vault/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";

/**
 * POST /api/vault/export
 *
 * Creates a vault-export job and dispatches to SQS.
 * Response: { jobId }
 */
export async function POST() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // cancel any existing active export jobs
    const job = await sql.begin(async (tx) => {
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id}
          AND type = 'vault-export'
          AND status IN ('queued', 'processing')
      `;
      const [inserted] = await tx`
        INSERT INTO app.canvas_import_jobs (user_id, type, status)
        VALUES (${user.user_id}::uuid, 'vault-export', 'queued')
        RETURNING id
      `;
      return inserted;
    });

    const jobId = job.id;

    // dispatch to SQS
    const queueUrl = getCanvasImportQueueUrl();
    try {
      if (queueUrl) {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              type: "vault-export",
              jobId,
              userId: user.user_id,
            }),
          }),
        );
      }
    } catch (sqsErr) {
      console.error("SQS send failed for vault export:", sqsErr.message);
    }

    try {
      await ensureWorkerRunning();
    } catch (ecsErr) {
      console.error("ECS scale-up failed for vault export:", ecsErr.message);
    }

    return NextResponse.json({ jobId });
  } catch (err) {
    console.error("vault export error:", err);
    return NextResponse.json(
      { error: "Failed to start export" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/vault/export/route.ts
git commit -m "feat(api): add vault export route with SQS dispatch"
```

---

### Task 12: Job Status API Route

Create a unified status polling route that works for both import and export vault jobs.

**Files:**

- Create: `src/app/api/vault/status/route.ts`

- [ ] **Step 1: Create the status route**

Create `src/app/api/vault/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * GET /api/vault/status?type=vault-import|vault-export
 *
 * Returns the most recent vault job status for the current user.
 * For exports, regenerates the presigned download URL if expired.
 *
 * Response: {
 *   job: { jobId, type, status, createdAt, startedAt, completedAt, expectedTotal, error } | null,
 *   downloadUrl: string | null  (export only)
 * }
 */
export async function GET(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "vault-import";

    if (!["vault-import", "vault-export"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const [job] = await sql`
      SELECT id, type, status, created_at, started_at, completed_at,
             expected_total, error_message, output_s3_key, download_url
      FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}
        AND type = ${type}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!job) {
      return NextResponse.json({ job: null, downloadUrl: null });
    }

    let downloadUrl = null;
    if (
      type === "vault-export" &&
      job.status === "complete" &&
      job.output_s3_key
    ) {
      // regenerate presigned URL (previous one may have expired)
      const bucket = process.env.STORAGE_BUCKET;
      const prefix = process.env.STORAGE_PREFIX || "oghma";
      const fullKey = `${prefix}/${job.output_s3_key}`;
      const s3 = new S3Client({
        region: process.env.STORAGE_REGION || "us-east-1",
      });

      downloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
        { expiresIn: 86400 },
      );
    }

    // for imports, count processed files for progress
    let progress = null;
    if (
      type === "vault-import" &&
      ["processing", "complete"].includes(job.status)
    ) {
      // count notes created since job started (approximate progress)
      const [counts] = await sql`
        SELECT COUNT(*) as total
        FROM app.notes
        WHERE user_id = ${user.user_id}
          AND created_at >= ${job.created_at}
          AND is_folder = false
          AND deleted = 0
      `;
      const completed = parseInt(counts?.total ?? "0", 10);
      const total = job.expected_total ?? 0;
      progress = {
        completed,
        total,
        percent:
          total > 0
            ? Math.min(100, Math.round((completed / total) * 100))
            : null,
      };
    }

    return NextResponse.json({
      job: {
        jobId: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        expectedTotal: job.expected_total,
        error: job.error_message,
      },
      downloadUrl,
      progress,
    });
  } catch (err) {
    console.error("vault status error:", err);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/vault/status/route.ts
git commit -m "feat(api): add vault job status polling route"
```

---

### Task 13: Data & Export Settings UI

Replace the disabled import/export placeholder buttons in the settings page with functional import/export UI components.

**Files:**

- Modify: `src/app/settings/page.jsx:898-947`
- Modify: `src/app/settings/page.jsx:1-22` (imports)

- [ ] **Step 1: Add import state and handlers to the settings page**

In `src/app/settings/page.jsx`, add state variables inside the `SettingsPage` component (after the existing `useState` calls around line 50):

After:

```js
const [savingSection, setSavingSection] = useState(null);
const [activeSection, setActiveSection] = useState("account");
```

Add:

```js
// vault import/export state
const [importStatus, setImportStatus] = useState(null); // null | 'uploading' | 'processing' | 'complete' | 'failed'
const [importProgress, setImportProgress] = useState(null); // { percent, completed, total }
const [importJobId, setImportJobId] = useState(null);
const [uploadProgress, setUploadProgress] = useState(0);
const [exportStatus, setExportStatus] = useState(null); // null | 'processing' | 'complete' | 'failed'
const [exportJobId, setExportJobId] = useState(null);
const [exportDownloadUrl, setExportDownloadUrl] = useState(null);
const importFileRef = useRef(null);
```

- [ ] **Step 2: Add the vault import handler**

Add this function inside the `SettingsPage` component, after the existing handler functions (before the `return` statement):

```js
// ── Vault Import ──
async function handleVaultImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.name.endsWith(".zip")) {
    toast.error(t("Please select a .zip file"));
    return;
  }

  try {
    setImportStatus("uploading");
    setUploadProgress(0);

    // get presigned URL
    const presignRes = await fetch("/api/vault/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentLength: file.size }),
    });
    if (!presignRes.ok) {
      const err = await presignRes.json();
      throw new Error(err.error || "Failed to get upload URL");
    }
    const { uploadUrl, s3Key } = await presignRes.json();

    // upload to S3 via XMLHttpRequest for progress tracking
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", "application/zip");
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status < 400
          ? resolve()
          : reject(new Error(`Upload failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });

    setImportStatus("processing");
    setUploadProgress(100);

    // start the import job
    const startRes = await fetch("/api/vault/import/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3Key }),
    });
    if (!startRes.ok) {
      const err = await startRes.json();
      throw new Error(err.error || "Failed to start import");
    }
    const { jobId } = await startRes.json();
    setImportJobId(jobId);

    toast.success(t("Import started! Processing your vault..."));
  } catch (err) {
    console.error("Vault import failed:", err);
    setImportStatus("failed");
    toast.error(err.message || t("Import failed"));
  }

  // reset file input
  if (importFileRef.current) importFileRef.current.value = "";
}

// ── Vault Export ──
async function handleVaultExport() {
  try {
    setExportStatus("processing");
    setExportDownloadUrl(null);

    const res = await fetch("/api/vault/export", {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to start export");
    }
    const { jobId } = await res.json();
    setExportJobId(jobId);

    toast.success(t("Export started! We'll notify you when it's ready."));
  } catch (err) {
    console.error("Vault export failed:", err);
    setExportStatus("failed");
    toast.error(err.message || t("Export failed"));
  }
}
```

- [ ] **Step 3: Add polling effects for import and export status**

Add these `useEffect` hooks inside the component (after the existing `useEffect` hooks):

```js
// poll import status
useEffect(() => {
  if (!importJobId || importStatus === "complete" || importStatus === "failed")
    return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/vault/status?type=vault-import`);
      if (!res.ok) return;
      const { job, progress } = await res.json();
      if (!job) return;
      if (job.status === "complete") {
        setImportStatus("complete");
        setImportProgress(progress);
        toast.success(t("Vault import complete!"));
        clearInterval(interval);
      } else if (job.status === "failed") {
        setImportStatus("failed");
        toast.error(job.error || t("Import failed"));
        clearInterval(interval);
      } else if (progress) {
        setImportProgress(progress);
      }
    } catch {
      /* ignore poll errors */
    }
  }, 3000);
  return () => clearInterval(interval);
}, [importJobId, importStatus, t]);

// poll export status
useEffect(() => {
  if (!exportJobId || exportStatus === "complete" || exportStatus === "failed")
    return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/vault/status?type=vault-export`);
      if (!res.ok) return;
      const { job, downloadUrl } = await res.json();
      if (!job) return;
      if (job.status === "complete" && downloadUrl) {
        setExportStatus("complete");
        setExportDownloadUrl(downloadUrl);
        toast.success(t("Vault export ready!"));
        clearInterval(interval);
      } else if (job.status === "failed") {
        setExportStatus("failed");
        toast.error(job.error || t("Export failed"));
        clearInterval(interval);
      }
    } catch {
      /* ignore poll errors */
    }
  }, 3000);
  return () => clearInterval(interval);
}, [exportJobId, exportStatus, t]);

// check for existing vault jobs on mount
useEffect(() => {
  async function checkExistingJobs() {
    try {
      const [importRes, exportRes] = await Promise.all([
        fetch("/api/vault/status?type=vault-import"),
        fetch("/api/vault/status?type=vault-export"),
      ]);
      if (importRes.ok) {
        const { job, progress } = await importRes.json();
        if (job && ["queued", "processing"].includes(job.status)) {
          setImportStatus("processing");
          setImportJobId(job.jobId);
          setImportProgress(progress);
        } else if (job?.status === "complete") {
          setImportStatus("complete");
          setImportProgress(progress);
        }
      }
      if (exportRes.ok) {
        const { job, downloadUrl } = await exportRes.json();
        if (job && ["queued", "processing"].includes(job.status)) {
          setExportStatus("processing");
          setExportJobId(job.jobId);
        } else if (job?.status === "complete" && downloadUrl) {
          setExportStatus("complete");
          setExportDownloadUrl(downloadUrl);
        }
      }
    } catch {
      /* ignore */
    }
  }
  checkExistingJobs();
}, []);
```

- [ ] **Step 4: Replace the Data & Export section UI**

Replace lines 898-947 (the `{/* ── Data & Export ── */}` section) with:

```jsx
{
  /* ── Data & Export ── */
}
<div
  id="data"
  className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
>
  <div>
    <h2 className="text-base/7 font-semibold text-text">
      {t("Data & Export")}
    </h2>
    <p className="mt-1 text-sm/6 text-text-tertiary">
      {t("Import or export your notes in various formats.")}
    </p>
  </div>

  <div className="md:col-span-2">
    <div className="space-y-6">
      {/* import section */}
      <div>
        <h3 className="text-sm/6 font-medium text-text mb-1">
          {t("Import Notes")}
        </h3>
        <p className="text-sm text-text-tertiary mb-4">
          {t(
            "Upload a .zip file to import folders and notes. Supports PDF, DOCX, Markdown, and more. Max 10GB.",
          )}
        </p>

        {importStatus === "uploading" && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
              <span>{t("Uploading...")}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-subtle rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {importStatus === "processing" && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
              <span>
                {importProgress
                  ? t("Processing {{completed}}/{{total}} files...", {
                      completed: importProgress.completed,
                      total: importProgress.total,
                    })
                  : t("Processing...")}
              </span>
              {importProgress?.percent != null && (
                <span>{importProgress.percent}%</span>
              )}
            </div>
            <div className="w-full bg-subtle rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${importProgress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {importStatus === "complete" && (
          <div className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20">
            {t("Import complete!")}
            {importProgress &&
              ` ${importProgress.completed} ${t("files processed")}.`}
          </div>
        )}

        {importStatus === "failed" && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
            {t("Import failed. Please try again.")}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={importFileRef}
            type="file"
            accept=".zip"
            onChange={handleVaultImport}
            disabled={
              importStatus === "uploading" || importStatus === "processing"
            }
            className="hidden"
            id="vault-import-file"
          />
          <label
            htmlFor="vault-import-file"
            className={cn(
              "rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text ring-1 ring-border-subtle cursor-pointer",
              importStatus === "uploading" || importStatus === "processing"
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-subtle-hover",
            )}
          >
            {importStatus === "uploading"
              ? t("Uploading...")
              : importStatus === "processing"
                ? t("Processing...")
                : t("Select .zip file")}
          </label>
        </div>
      </div>

      {/* export section */}
      <div className="border-t border-border pt-6">
        <h3 className="text-sm/6 font-medium text-text mb-1">
          {t("Export Notes")}
        </h3>
        <p className="text-sm text-text-tertiary mb-4">
          {t("Download all your notes and files as a zip archive.")}
        </p>

        {exportStatus === "processing" && (
          <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
            <svg
              className="animate-spin h-4 w-4 text-primary-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {t("Generating export... This may take a few minutes.")}
          </div>
        )}

        {exportStatus === "complete" && exportDownloadUrl && (
          <div className="mb-4">
            <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20 mb-3">
              {t("Export ready!")}
            </div>
            <a
              href={exportDownloadUrl}
              download
              className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 inline-block"
            >
              {t("Download vault.zip")}
            </a>
            <p className="mt-2 text-xs text-text-tertiary">
              {t("Link expires in 24 hours.")}
            </p>
          </div>
        )}

        {exportStatus === "failed" && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
            {t("Export failed. Please try again.")}
          </div>
        )}

        <button
          type="button"
          onClick={handleVaultExport}
          disabled={exportStatus === "processing"}
          className={cn(
            "rounded-md bg-subtle px-3 py-2 text-sm font-semibold text-text ring-1 ring-border-subtle",
            exportStatus === "processing"
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-subtle-hover",
          )}
        >
          {exportStatus === "processing"
            ? t("Exporting...")
            : t("Export vault")}
        </button>
      </div>
    </div>
  </div>
</div>;
```

- [ ] **Step 5: Verify the settings page renders without errors**

Open `http://localhost:3000/settings` in the browser, scroll to the Data & Export section. Verify:

- Import section has a "Select .zip file" button
- Export section has an "Export vault" button
- No console errors in the browser dev tools

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/page.jsx
git commit -m "feat(settings): add vault import/export UI with progress tracking"
```

---

### Task 14: Build Verification

Verify the Next.js build succeeds with all changes.

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: Build completes without errors. Some warnings about unused vars or missing env vars at build time are OK (env vars are runtime-only per the project's Amplify setup).

- [ ] **Step 2: Fix any type or import errors**

If the build fails, fix the specific errors reported. Common issues:

- Missing imports (ensure all new files import from the correct paths)
- TypeScript type errors in the `.ts` route files
- Unused variables in the settings page

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build errors from vault import/export"
```

---

### Task 15: Integration Smoke Test

Verify the full flow works end-to-end on the dev environment.

**Files:** None (testing only)

- [ ] **Step 1: Test AI Settings UI**

1. Navigate to `http://localhost:3000/settings`
2. Scroll to AI Settings section
3. Verify model selector shows "Kimi K2.5" (disabled)
4. Verify BYOK section shows "Coming Soon" badge with disabled inputs

- [ ] **Step 2: Test Import UI flow**

1. Scroll to Data & Export section
2. Click "Select .zip file"
3. Select a small test zip file
4. Verify upload progress bar appears
5. If backend is configured: verify "Processing..." status appears

- [ ] **Step 3: Test Export UI flow**

1. Click "Export vault" button
2. Verify spinner and "Generating export..." message appears
3. If backend is configured: verify download button appears when complete

- [ ] **Step 4: Test status polling**

1. Open browser dev tools Network tab
2. Verify `/api/vault/status` requests happen every 3 seconds while a job is active
3. Verify polling stops when job reaches complete/failed status

---
