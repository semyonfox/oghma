#!/usr/bin/env -S npx tsx

/**
 * Backfills Qdrant vectors for existing app.chunks rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings-direct.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { embedChunks } from "../src/lib/embeddings.ts";
import { upsertChunkVectors } from "../src/lib/qdrant.ts";

interface ChunkRow {
  id: string;
  document_id: string;
  user_id: string;
  text: string;
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
const BATCH_SIZE = Number.parseInt(process.env.EMBED_BATCH_SIZE || "20", 10);

async function main(): Promise<void> {
  if (!DB_URL) throw new Error("DATABASE_URL not set");

  const sql = postgres(DB_URL, {
    ssl: DB_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 3,
    connect_timeout: 15,
  });

  try {
    const chunks = await sql<ChunkRow[]>`
      SELECT c.id, c.document_id, c.user_id, c.text
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE n.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `;

    console.log(`chunks to upsert into Qdrant: ${chunks.length}`);
    let inserted = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedChunks(batch.map((row) => row.text || ""));
      await upsertChunkVectors(
        embeddings.map((entry, index) => ({
          chunkId: batch[index].id,
          documentId: batch[index].document_id,
          userId: batch[index].user_id,
          vector: entry.vector,
        })),
      );
      inserted += embeddings.length;
      console.log(`upserted ${inserted}/${chunks.length}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("Fatal:", errorMessage(error));
  process.exit(1);
});
