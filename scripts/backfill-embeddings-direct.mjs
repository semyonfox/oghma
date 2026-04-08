/**
 * Direct backfill script — bypasses the 30s embeddings timeout
 * by calling the API directly with a configurable timeout.
 * Processes chunks in configurable batches.
 *
 * Usage:
 *   node scripts/backfill-embeddings-direct.mjs
 */

import postgres from "postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env loading ────────────────────────────────────────────────────────────

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
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

// ── config ─────────────────────────────────────────────────────────────────

const API_URL = process.env.EMBEDDING_API_URL;
const API_KEY = process.env.EMBEDDING_API_KEY;
const MODEL   = process.env.EMBEDDING_MODEL || "mxbai-embed-large";
const DB_URL  = process.env.DATABASE_URL;

// per-batch timeout (ms) — generous for slow CPU inference
const TIMEOUT_MS = parseInt(process.env.EMBED_TIMEOUT_MS || "300000", 10); // 5 min default

// how many chunks to embed per API call — smaller = more requests but less per-call time
const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || "20", 10);

// ── embedding ──────────────────────────────────────────────────────────────

async function embedBatch(texts) {
  if (!API_URL || !API_KEY) throw new Error("EMBEDDING_API_URL / EMBEDDING_API_KEY not set");

  const endpoints = [
    `${API_URL}/api/embeddings`,
    `${API_URL}/v1/embeddings`,
    `${API_URL}/ollama/api/embed`,
  ];

  let lastError;
  for (const endpoint of endpoints) {
    try {
      console.log(`  → ${endpoint} (${texts.length} chunks, timeout ${TIMEOUT_MS / 1000}s)`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ input: texts, model: MODEL }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text();
        console.warn(`  ✗ ${endpoint} HTTP ${res.status}: ${body.slice(0, 100)}`);
        lastError = new Error(`${endpoint} HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();

      let embeddings = [];
      if (json.data && Array.isArray(json.data)) {
        embeddings = json.data.map((i) => i.embedding).filter(Boolean);
      } else if (json.embeddings && Array.isArray(json.embeddings)) {
        embeddings = json.embeddings;
      } else if (Array.isArray(json)) {
        embeddings = json;
      }

      if (embeddings.length !== texts.length) {
        console.warn(`  ✗ count mismatch: got ${embeddings.length}, expected ${texts.length}`);
        lastError = new Error("embedding count mismatch");
        continue;
      }

      return embeddings;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`  ✗ ${endpoint} failed: ${lastError.message}`);
    }
  }

  throw lastError || new Error("All endpoints failed");
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!DB_URL) throw new Error("DATABASE_URL not set");

  const sql = postgres(DB_URL, { ssl: "require", max: 3, connect_timeout: 15 });

  try {
    const missing = await sql`
      SELECT c.id, c.text
      FROM app.chunks c
      LEFT JOIN app.embeddings e ON e.chunk_id = c.id
      WHERE e.chunk_id IS NULL
      ORDER BY c.created_at ASC
    `;

    console.log(`\nChunks missing embeddings: ${missing.length}`);
    if (missing.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    console.log(`Config: batch_size=${BATCH_SIZE}, timeout=${TIMEOUT_MS / 1000}s, model=${MODEL}`);

    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
      console.log(`\nBatch ${batchNum}/${totalBatches} (chunks ${i + 1}-${Math.min(i + BATCH_SIZE, missing.length)})`);

      try {
        const start = Date.now();
        const vectors = await embedBatch(batch.map((r) => r.text || ""));
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✓ ${vectors.length} vectors in ${elapsed}s`);

        // Insert using UNNEST for efficiency
        const ids = batch.map((r) => r.id);
        const vectorStrings = vectors.map((v) => JSON.stringify(v));

        await sql`
          INSERT INTO app.embeddings (chunk_id, embedding)
          SELECT t.chunk_id, t.embedding::vector
          FROM UNNEST(
            ${ids}::uuid[],
            ${vectorStrings}::text[]
          ) AS t(chunk_id, embedding)
          WHERE NOT EXISTS (
            SELECT 1 FROM app.embeddings e WHERE e.chunk_id = t.chunk_id
          )
        `;

        inserted += vectors.length;
        console.log(`  ✓ inserted. Total: ${inserted}/${missing.length}`);
      } catch (err) {
        failed += batch.length;
        console.error(`  ✗ batch failed: ${err.message}`);
      }
    }

    console.log(`\n=== backfill complete ===`);
    console.log(`  inserted: ${inserted}`);
    console.log(`  failed:   ${failed}`);
    console.log(`  total:    ${missing.length}`);

    // Final count check
    const [final] = await sql`
      SELECT COUNT(DISTINCT c.id)::int AS total,
             COUNT(DISTINCT e.chunk_id)::int AS embedded
      FROM app.chunks c LEFT JOIN app.embeddings e ON e.chunk_id = c.id
    `;
    console.log(`\nDB state: ${final.embedded}/${final.total} chunks have embeddings`);

  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
