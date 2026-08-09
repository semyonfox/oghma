#!/usr/bin/env node

/** Apply ready immutable cache revisions only where the user projection still
 * exactly equals its old canonical Markdown.  Divergent notes are recorded as
 * update-available and are never modified. */
import sql from "../database/pgsql.ts";
import { cloneImportedPdfCacheToNote } from "../src/lib/canvas/import-cache.ts";

const pipelineVersion = process.env.CACHE_REPROCESS_PIPELINE_VERSION?.trim();
if (!pipelineVersion) throw new Error("CACHE_REPROCESS_PIPELINE_VERSION is required");

async function main() {
  const rows = await sql`
    SELECT n.note_id, n.user_id, n.title, n.content, old.id AS old_cache_id,
      old.extracted_markdown AS old_markdown, newer.id AS new_cache_id
    FROM app.notes n
    JOIN app.imported_file_cache old ON old.id = n.imported_file_cache_id
    JOIN app.imported_file_cache newer
      ON newer.sha256 = old.sha256 AND newer.pipeline_version = ${pipelineVersion}
    WHERE n.deleted_at IS NULL AND n.is_import_cache_source = FALSE
      AND newer.status = 'ready' AND newer.replayable = TRUE
      AND old.pipeline_version <> ${pipelineVersion}
    ORDER BY n.created_at
  `;
  let applied = 0, available = 0, binary = 0;
  for (const row of rows) {
    if (!/\.md$/i.test(row.title)) {
      await sql`UPDATE app.notes SET imported_file_cache_id = ${row.new_cache_id}::uuid,
        updated_at = NOW() WHERE note_id = ${row.note_id}::uuid`;
      binary++;
      continue;
    }
    if (String(row.content ?? "") === String(row.old_markdown ?? "")) {
      await cloneImportedPdfCacheToNote({ cacheId: row.new_cache_id, noteId: row.note_id,
        userId: row.user_id });
      await sql`INSERT INTO app.imported_file_cache_note_updates
        (note_id, base_cache_id, available_cache_id, status, updated_at)
        VALUES (${row.note_id}::uuid, ${row.old_cache_id}::uuid, ${row.new_cache_id}::uuid,
          'applied', NOW())
        ON CONFLICT (note_id) DO UPDATE SET base_cache_id = EXCLUDED.base_cache_id,
          available_cache_id = EXCLUDED.available_cache_id, status = 'applied', updated_at = NOW()`;
      applied++;
    } else {
      await sql`INSERT INTO app.imported_file_cache_note_updates
        (note_id, base_cache_id, available_cache_id, status, updated_at)
        VALUES (${row.note_id}::uuid, ${row.old_cache_id}::uuid, ${row.new_cache_id}::uuid,
          'available', NOW())
        ON CONFLICT (note_id) DO UPDATE SET base_cache_id = EXCLUDED.base_cache_id,
          available_cache_id = EXCLUDED.available_cache_id, status = 'available', updated_at = NOW()`;
      available++;
    }
  }
  console.log(JSON.stringify({ examined: rows.length, applied, updateAvailable: available, binaryUpdated: binary }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
