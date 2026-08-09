#!/usr/bin/env node

/**
 * Creates a new immutable Marker/cache revision without touching editable
 * notes.  It creates non-tree source notes solely for the durable Marker
 * pipeline; completion captures the result into imported_file_cache.
 *
 * Required: CACHE_REPROCESS_PIPELINE_VERSION
 * Optional: CACHE_REPROCESS_EXCLUDE_SHA_FILE (recovery manifest JSON or text)
 *           CACHE_REPROCESS_LIMIT (for a deliberately bounded rollout)
 */
import fs from "node:fs";
import path from "node:path";
import sql from "../database/pgsql.ts";
import { submitMarkerJob } from "../src/lib/marker-serverless.ts";

function excludedShas() {
  const filename = process.env.CACHE_REPROCESS_EXCLUDE_SHA_FILE?.trim();
  if (!filename) return new Set();
  const raw = fs.readFileSync(path.resolve(filename), "utf8");
  try {
    const parsed = JSON.parse(raw);
    const files = Array.isArray(parsed) ? parsed : parsed.files;
    if (Array.isArray(files)) return new Set(files.map((file) => file?.sha256).filter(Boolean));
  } catch { /* plain newline-separated SHA list */ }
  return new Set(raw.match(/\b[a-f0-9]{64}\b/gi) ?? []);
}

const pipelineVersion = process.env.CACHE_REPROCESS_PIPELINE_VERSION?.trim();
const limit = Number.parseInt(process.env.CACHE_REPROCESS_LIMIT ?? "0", 10);
if (!pipelineVersion) throw new Error("CACHE_REPROCESS_PIPELINE_VERSION is required");

async function main() {
  const excluded = [...excludedShas()];
  const candidates = await sql`
    SELECT current.id AS current_cache_id, current.sha256, current.mime_type,
      current.file_size, current.storage_key,
      (SELECT n.user_id FROM app.notes n
       WHERE n.imported_file_cache_id = current.id
         AND n.deleted_at IS NULL AND n.is_import_cache_source = FALSE
       ORDER BY n.created_at LIMIT 1) AS owner_user_id
    FROM app.imported_file_cache current
    WHERE current.status = 'ready' AND current.replayable = TRUE
      AND current.pipeline_version <> ${pipelineVersion}
      AND NOT (current.sha256 = ANY(${excluded}::text[]))
      AND NOT EXISTS (
        SELECT 1 FROM app.imported_file_cache newer
        WHERE newer.sha256 = current.sha256 AND newer.pipeline_version = ${pipelineVersion}
      )
    ORDER BY current.created_at
    ${limit > 0 ? sql`LIMIT ${limit}` : sql``}
  `;
  const processable = candidates.filter((row) => row.owner_user_id);
  console.log(JSON.stringify({ candidates: candidates.length, processable: processable.length,
    skippedWithoutOwner: candidates.length - processable.length, pipelineVersion }));

  for (const row of processable) {
    const [cache] = await sql`
      INSERT INTO app.imported_file_cache (
        sha256, pipeline_version, mime_type, file_size, storage_key, status,
        replayable, processing_started_at, updated_at
      ) VALUES (
        ${row.sha256}, ${pipelineVersion}, ${row.mime_type}, ${row.file_size},
        ${row.storage_key}, 'processing', FALSE, NOW(), NOW()
      )
      ON CONFLICT (sha256, pipeline_version) DO NOTHING
      RETURNING id
    `;
    if (!cache) continue;
    const [source] = await sql`
      INSERT INTO app.notes (
        note_id, user_id, title, content, s3_key, is_folder,
        imported_file_cache_id, is_import_cache_source, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${row.owner_user_id}::uuid,
        ${`[system] canonical ${row.sha256}.md`}, '', ${row.storage_key}, FALSE,
        ${cache.id}::uuid, TRUE, NOW(), NOW()
      ) RETURNING note_id
    `;
    await submitMarkerJob({
      sourceKey: row.storage_key,
      sourceBytes: Number(row.file_size),
      noteId: source.note_id,
      userId: row.owner_user_id,
      filename: `${row.sha256}.pdf`,
      mimeType: row.mime_type,
      importedFileCacheId: cache.id,
    });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
