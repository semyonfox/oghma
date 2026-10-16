#!/usr/bin/env -S npx tsx

/**
 * Re-embeds existing app.chunks rows into Qdrant under their current ids, for
 * recovering a lost or recreated collection without re-chunking notes. Ids
 * matter because quiz questions keep chunk_id provenance. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings-direct.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { embedChunks } from "../src/lib/rag/embeddings.ts";
import {
  deleteChunkVectors,
  setChunkVectorsSearchable,
  upsertChunkVectors,
} from "../src/lib/qdrant.ts";

interface ChunkRow {
  id: string;
  document_id: string;
  user_id: string;
  text: string;
  trashed: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadEnv(): void {
  for (const filename of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), filename);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
    break;
  }
}

loadEnv();

const DB_URL = process.env.DATABASE_URL;
const parsedBatchSize = Number.parseInt(process.env.EMBED_BATCH_SIZE || "", 10);
const BATCH_SIZE = Number.isSafeInteger(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 20;

async function main(): Promise<void> {
  if (!DB_URL) throw new Error("DATABASE_URL not set");

  // no ssl option: postgres.js reads sslmode from the URL, and forcing one
  // here would turn verify-full into plaintext
  const sql = postgres(DB_URL, {
    max: 3,
    connect_timeout: 15,
  });

  try {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
      WHERE NULLIF(TRIM(c.text), '') IS NOT NULL
    `;
    console.log(`chunks to upsert into Qdrant: ${count}`);

    let upserted = 0;
    let orphaned = 0;
    let after: string | null = null;

    // page by id so memory stays flat however large the table is
    while (true) {
      const batch: ChunkRow[] = await sql<ChunkRow[]>`
        SELECT c.id, c.document_id, c.user_id, c.text, n.deleted_at IS NOT NULL AS trashed
        FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
        WHERE (${after}::uuid IS NULL OR c.id > ${after}::uuid)
          AND NULLIF(TRIM(c.text), '') IS NOT NULL
        ORDER BY c.id
        LIMIT ${BATCH_SIZE}
      `;
      if (batch.length === 0) break;
      after = batch[batch.length - 1].id;

      // blank rows are filtered in SQL above, so embedChunks returns exactly
      // one vector per row in the same order
      const embeddings = await embedChunks(batch.map((row) => row.text));
      if (embeddings.length !== batch.length) {
        throw new Error(`expected ${batch.length} vectors, got ${embeddings.length}`);
      }
      await upsertChunkVectors(
        batch.map((row, index) => ({
          chunkId: row.id,
          documentId: row.document_id,
          userId: row.user_id,
          vector: embeddings[index].vector,
        })),
      );
      // trashed notes keep their chunks so a restore can bring them back, but
      // their vectors must stay out of search until then
      const trashedIds = batch.filter((row) => row.trashed).map((row) => row.id);
      if (trashedIds.length > 0) await setChunkVectorsSearchable(trashedIds, false);

      // a live reindex may have replaced some of these rows while they were
      // being embedded; drop vectors whose chunk no longer exists
      const surviving = await sql<{ id: string }[]>`
        SELECT id FROM app.chunks WHERE id = ANY(${batch.map((row) => row.id)}::uuid[])
      `;
      const survivingIds = new Set(surviving.map((row) => row.id));
      const gone = batch.map((row) => row.id).filter((id) => !survivingIds.has(id));
      if (gone.length > 0) {
        await deleteChunkVectors(gone);
        orphaned += gone.length;
      }

      upserted += batch.length - gone.length;
      console.log(`upserted ${upserted}/${count}`);
    }

    if (orphaned > 0) console.log(`removed ${orphaned} vectors for chunks replaced mid-run`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("Fatal:", errorMessage(error));
  process.exit(1);
});
