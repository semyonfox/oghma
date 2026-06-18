// full re-index: reads all notes with content, chunks, embeds, and stores
// vectors in Qdrant while keeping chunk metadata in Postgres.
//
// usage: node --import=tsx scripts/reindex-all-notes.mjs [--dry-run]

import fs from "fs";
import path from "path";
import sql from "../src/database/pgsql.js";
import { chunkText } from "../src/lib/chunking.ts";
import { deleteChunkVectors } from "../src/lib/qdrant.ts";
import { normalizeChunksForIndexing, replaceNoteEmbeddings } from "../src/lib/rag/indexing.ts";

const DRY_RUN = process.argv.includes("--dry-run");
// small concurrency to stay under Cohere rate limits
const NOTE_BATCH = 50;

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }

    break;
  }
}

async function fetchNotesWithContent(offset, limit) {
  return sql`
    SELECT note_id, user_id, title,
           COALESCE(NULLIF(TRIM(extracted_text), ''), NULLIF(TRIM(content), '')) AS text
    FROM app.notes
    WHERE deleted_at IS NULL
      AND is_folder = false
      AND (
        (extracted_text IS NOT NULL AND TRIM(extracted_text) != '')
        OR (content IS NOT NULL AND TRIM(content) != '')
      )
    ORDER BY created_at ASC
    OFFSET ${offset} LIMIT ${limit}
  `;
}

async function main() {
  loadEnv();

  const FORCE = process.argv.includes("--force");
  if (DRY_RUN) console.log("=== DRY RUN — no writes ===\n");

  // with --force, wipe existing chunks+embeddings and rebuild from scratch
  if (FORCE && !DRY_RUN) {
    console.log("--force: clearing all existing chunks and embeddings...");
    const rows = await sql`SELECT id FROM app.chunks`;
    await deleteChunkVectors(rows.map((row) => row.id)).catch(() => undefined);
    await sql`DELETE FROM app.chunks`;
    console.log("cleared.\n");
  }

  // count total notes to process
  const [{ count }] = await sql`
    SELECT COUNT(*) AS count
    FROM app.notes
    WHERE deleted_at IS NULL
      AND is_folder = false
      AND (
        (extracted_text IS NOT NULL AND TRIM(extracted_text) != '')
        OR (content IS NOT NULL AND TRIM(content) != '')
      )
  `;

  const total = Number(count);
  console.log(`notes with content: ${total}`);
  if (total === 0) return;

  let processed = 0;
  let chunked = 0;
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (let offset = 0; offset < total; offset += NOTE_BATCH) {
    const notes = await fetchNotesWithContent(offset, NOTE_BATCH);

    for (const note of notes) {
      processed++;
      const prefix = `[${processed}/${total}] ${note.title?.slice(0, 40) || note.note_id}`;

      // chunk the text
      const raw = chunkText(note.text);
      const chunks = normalizeChunksForIndexing(raw);

      if (chunks.length === 0) {
        skipped++;
        console.log(`${prefix} — no chunks (empty after normalization)`);
        continue;
      }

      chunked += chunks.length;

      if (DRY_RUN) {
        console.log(`${prefix} — ${chunks.length} chunks (dry run)`);
        continue;
      }

      try {
        const stored = await replaceNoteEmbeddings(note.note_id, note.user_id, chunks);
        embedded += stored;
        console.log(`${prefix} — ${stored} chunks embedded`);
      } catch (err) {
        failed++;
        console.error(
          `${prefix} — FAILED: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  console.log("\n--- reindex summary ---");
  console.log(`  notes processed: ${processed}`);
  console.log(`  chunks created:  ${chunked}`);
  console.log(`  embeddings stored: ${embedded}`);
  console.log(`  skipped (empty):   ${skipped}`);
  console.log(`  failed:            ${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
