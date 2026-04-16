// full re-index: reads all notes with content, chunks, embeds via Cohere, stores
// run after migration 014 to repopulate the empty chunks+embeddings tables
//
// usage: node --import=tsx scripts/reindex-all-notes.mjs [--dry-run]

import fs from "fs";
import path from "path";
import sql from "../src/database/pgsql.js";
import { chunkText } from "../src/lib/chunking.ts";
import { embedChunks } from "../src/lib/embeddings.ts";
import { normalizeChunksForIndexing } from "../src/lib/rag/indexing.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const EMBED_BATCH = 96; // Cohere limit
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
    await sql`DELETE FROM app.embeddings`;
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

      // embed in batches of 96
      try {
        const allEmbeddings = [];
        for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
          const batch = chunks.slice(i, i + EMBED_BATCH);
          const result = await embedChunks(batch);
          allEmbeddings.push(...result);
        }

        if (allEmbeddings.length === 0) {
          console.log(`${prefix} — embedding returned empty, skipping`);
          skipped++;
          continue;
        }

        // atomic insert: chunks + embeddings in one transaction
        await sql.begin(async (tx) => {
          const chunkRows = await tx`
            INSERT INTO app.chunks (document_id, user_id, text)
            SELECT * FROM UNNEST(
              ${allEmbeddings.map(() => note.note_id)}::uuid[],
              ${allEmbeddings.map(() => note.user_id)}::uuid[],
              ${allEmbeddings.map((e) => e.chunk)}::text[]
            )
            RETURNING id
          `;

          await tx`
            INSERT INTO app.embeddings (chunk_id, embedding)
            SELECT * FROM UNNEST(
              ${chunkRows.map((r) => r.id)}::uuid[],
              ${allEmbeddings.map((e) => JSON.stringify(e.vector))}::vector[]
            )
          `;
        });

        embedded += allEmbeddings.length;
        console.log(`${prefix} — ${allEmbeddings.length} chunks embedded`);
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
