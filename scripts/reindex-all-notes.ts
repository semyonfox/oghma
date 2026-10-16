#!/usr/bin/env -S npx tsx

// full re-index: re-chunks and re-embeds every live note and replaces its
// chunk rows and Qdrant vectors. safe to re-run: each note is replaced in one
// locked transaction, so stale chunks (including those of notes whose content
// is now empty) are removed and a failed note keeps its previous index.
//
// usage: npx tsx scripts/reindex-all-notes.ts [--dry-run]

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "../src/database/pgsql.ts";
import { chunkText } from "../src/lib/rag/chunking.ts";
import { normalizeChunksForIndexing, replaceNoteEmbeddings } from "../src/lib/rag/indexing.ts";

interface NoteRow {
  note_id: string;
  user_id: string;
  title: string | null;
  text: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DRY_RUN = process.argv.includes("--dry-run");
const NOTE_PAGE_SIZE = 50;

function loadEnv(): void {
  for (const filename of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), filename);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }

    break;
  }
}

// notes with text to index, plus notes that still hold chunks but no longer
// have text, so their stale vectors get cleared
async function fetchNotePage(after: string | null): Promise<NoteRow[]> {
  return sql<NoteRow[]>`
    SELECT n.note_id, n.user_id, n.title,
           COALESCE(NULLIF(TRIM(n.extracted_text), ''), NULLIF(TRIM(n.content), '')) AS text
    FROM app.notes n
    WHERE n.deleted_at IS NULL
      AND COALESCE(n.is_folder, false) = false
      AND (${after}::uuid IS NULL OR n.note_id > ${after}::uuid)
      AND (
        NULLIF(TRIM(n.extracted_text), '') IS NOT NULL
        OR NULLIF(TRIM(n.content), '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM app.chunks c
          WHERE c.document_id = n.note_id AND c.user_id = n.user_id
        )
      )
    ORDER BY n.note_id
    LIMIT ${NOTE_PAGE_SIZE}
  `;
}

async function main(): Promise<void> {
  loadEnv();
  if (DRY_RUN) console.log("=== DRY RUN — no writes ===\n");

  let processed = 0;
  let chunked = 0;
  let embedded = 0;
  let cleared = 0;
  let failed = 0;
  let after: string | null = null;

  while (true) {
    const notes = await fetchNotePage(after);
    if (notes.length === 0) break;
    after = notes[notes.length - 1].note_id;

    for (const note of notes) {
      processed++;
      const prefix = `[${processed}] ${note.title?.slice(0, 40) || note.note_id}`;
      const chunks = normalizeChunksForIndexing(chunkText(note.text ?? ""));
      chunked += chunks.length;

      if (DRY_RUN) {
        console.log(`${prefix} — ${chunks.length} chunks (dry run)`);
        continue;
      }

      try {
        const stored = await replaceNoteEmbeddings(note.note_id, note.user_id, chunks);
        embedded += stored;
        if (chunks.length === 0) cleared++;
        console.log(
          chunks.length === 0
            ? `${prefix} — no text, stale chunks cleared`
            : `${prefix} — ${stored} chunks embedded`,
        );
      } catch (err) {
        failed++;
        console.error(`${prefix} — FAILED: ${errorMessage(err)}`);
      }
    }
  }

  console.log("\n--- reindex summary ---");
  console.log(`  notes processed:   ${processed}`);
  console.log(`  chunks created:    ${chunked}`);
  console.log(`  embeddings stored: ${embedded}`);
  console.log(`  cleared (empty):   ${cleared}`);
  console.log(`  failed:            ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
