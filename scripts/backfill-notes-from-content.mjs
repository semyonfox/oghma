/**
 * Backfill: re-indexes notes via mxbai-embed-large on ai.semyon.ie
 * Skips already-indexed notes, resumes safely after interruption.
 *
 * Usage:
 *   node scripts/backfill-notes-from-content.mjs
 */

import postgres from "postgres";
import fs from "fs";
import path from "path";

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

const DB_URL   = process.env.DATABASE_URL;
const API_URL  = process.env.EMBEDDING_API_URL;
const API_KEY  = process.env.EMBEDDING_API_KEY;
const MODEL    = process.env.EMBEDDING_MODEL || "mxbai-embed-large";
const TIMEOUT  = parseInt(process.env.EMBED_TIMEOUT_MS || "120000", 10);
const BATCH_SZ = parseInt(process.env.EMBED_BATCH_SIZE || "10",     10);
const CHUNK_SZ = parseInt(process.env.CHUNK_SIZE       || "600",    10);
const CHUNK_OVL= parseInt(process.env.CHUNK_OVERLAP    || "100",    10);

function chunkText(text) {
  if (!text?.trim()) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  let pos = 0;
  while (pos < normalized.length) {
    const raw = normalized.slice(pos, Math.min(pos + CHUNK_SZ, normalized.length)).trim();
    if (raw) chunks.push(raw);
    pos += CHUNK_SZ - CHUNK_OVL;
  }
  return [...new Set(chunks.filter((c) => c.length > 30))];
}

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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ input: texts, model: MODEL, keep_alive: 600 }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      let embeddings = [];
      if (json.data && Array.isArray(json.data))
        embeddings = json.data.map((i) => i.embedding).filter(Boolean);
      else if (json.embeddings && Array.isArray(json.embeddings))
        embeddings = json.embeddings;
      else if (Array.isArray(json))
        embeddings = json;
      if (embeddings.length !== texts.length) {
        lastError = new Error(`count mismatch: got ${embeddings.length}, expected ${texts.length}`);
        continue;
      }
      return embeddings;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error("All embedding endpoints failed");
}

async function embedBatchWithRetry(texts, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await embedBatch(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 400/503 often means wrong model is loaded — wait and retry
      if (attempt < maxRetries && (msg.includes("HTTP 4") || msg.includes("HTTP 5") || msg.includes("timeout"))) {
        const wait = attempt * 20000;
        process.stdout.write(` [retry ${attempt}/${maxRetries} in ${wait/1000}s]`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  if (!DB_URL) throw new Error("DATABASE_URL not set");

  const runStart = Date.now();
  console.log(`model:   ${MODEL}`);
  console.log(`server:  ${API_URL}`);
  console.log(`batch:   ${BATCH_SZ} chunks/call  timeout: ${TIMEOUT / 1000}s`);
  console.log(`chunker: ${CHUNK_SZ} chars  overlap: ${CHUNK_OVL}\n`);

  const sql = postgres(DB_URL, { ssl: "require", max: 3, connect_timeout: 15 });

  try {
    const notes = await sql`
      SELECT note_id, user_id,
        COALESCE(
          NULLIF(TRIM(extracted_text), ''),
          CASE WHEN s3_key IS NULL THEN NULLIF(TRIM(content), '') END
        ) AS text
      FROM app.notes
      WHERE (deleted = 0 OR deleted IS NULL) AND is_folder = false
        AND (
          (extracted_text IS NOT NULL AND length(extracted_text) > 100)
          OR (s3_key IS NULL AND content IS NOT NULL AND length(content) > 100)
        )
      ORDER BY updated_at DESC
    `;

    const alreadyIndexed = await sql`
      SELECT DISTINCT c.document_id FROM app.chunks c
      JOIN app.embeddings e ON e.chunk_id = c.id
    `;
    const indexedSet = new Set(alreadyIndexed.map((r) => r.document_id));
    const toProcess  = notes.filter((n) => !indexedSet.has(n.note_id));

    console.log(`total indexable: ${notes.length}  already done: ${indexedSet.size}  remaining: ${toProcess.length}\n`);
    if (toProcess.length === 0) { console.log("nothing to do"); return; }

    // running totals
    let notesOk = 0, notesFailed = 0, totalChunks = 0, totalEmbedded = 0;
    let totalEmbedMs = 0, totalDbMs = 0, batchCount = 0;

    for (let ni = 0; ni < toProcess.length; ni++) {
      const note   = toProcess[ni];
      const chunks = chunkText(note.text);
      if (!chunks.length) continue;

      const noteStart = Date.now();
      totalChunks += chunks.length;

      process.stdout.write(
        `[${ni + 1}/${toProcess.length}] ${note.note_id.slice(0, 8)} | ${chunks.length} chunks | `
      );

      try {
        // --- embed ---
        const embedStart = Date.now();
        const allVectors = [];
        for (let bi = 0; bi < chunks.length; bi += BATCH_SZ) {
          const batch    = chunks.slice(bi, bi + BATCH_SZ);
          const bStart   = Date.now();
          const vecs     = await embedBatchWithRetry(batch);
          const bMs      = Date.now() - bStart;
          totalEmbedMs  += bMs;
          batchCount++;
          allVectors.push(...vecs);
        }
        const embedMs = Date.now() - embedStart;

        if (allVectors.length !== chunks.length)
          throw new Error(`vector mismatch ${allVectors.length}/${chunks.length}`);

        // --- db write ---
        const dbStart = Date.now();
        const existing = await sql`SELECT id FROM app.chunks WHERE document_id = ${note.note_id}::uuid`;
        if (existing.length) {
          const ids = existing.map((r) => r.id);
          await sql`DELETE FROM app.embeddings WHERE chunk_id = ANY(${ids}::uuid[])`;
          await sql`DELETE FROM app.chunks      WHERE id       = ANY(${ids}::uuid[])`;
        }
        await sql.begin(async (tx) => {
          const rows = await tx`
            INSERT INTO app.chunks (document_id, user_id, text)
            SELECT * FROM UNNEST(
              ${chunks.map(() => note.note_id)}::uuid[],
              ${chunks.map(() => note.user_id)}::uuid[],
              ${chunks}::text[]
            ) RETURNING id
          `;
          await tx`
            INSERT INTO app.embeddings (chunk_id, embedding)
            SELECT * FROM UNNEST(
              ${rows.map((r) => r.id)}::uuid[],
              ${allVectors.map((v) => JSON.stringify(v))}::vector[]
            )
          `;
        });
        const dbMs = Date.now() - dbStart;
        totalDbMs += dbMs;

        const noteMs      = Date.now() - noteStart;
        const msPerChunk  = (embedMs / chunks.length).toFixed(0);
        totalEmbedded    += chunks.length;
        notesOk++;

        process.stdout.write(
          `embed ${(embedMs / 1000).toFixed(1)}s (${msPerChunk}ms/chunk) | db ${dbMs}ms | note ${(noteMs / 1000).toFixed(1)}s ✓\n`
        );
      } catch (err) {
        notesFailed++;
        process.stdout.write(` ✗ ${err.message?.slice(0, 70)}\n`);
      }

      // running summary every 25 notes
      if ((ni + 1) % 25 === 0) {
        const elapsed   = (Date.now() - runStart) / 1000;
        const avgMsPerChunk = batchCount ? (totalEmbedMs / (batchCount * BATCH_SZ)).toFixed(0) : "?";
        console.log(
          `  ── progress: ${notesOk} ok / ${notesFailed} failed | ` +
          `${totalEmbedded} chunks | avg ${avgMsPerChunk}ms/chunk | ${elapsed.toFixed(0)}s elapsed ──`
        );
      }
    }

    const totalSec    = ((Date.now() - runStart) / 1000).toFixed(1);
    const avgMsPerChunk = totalEmbedded ? (totalEmbedMs / totalEmbedded).toFixed(1) : "n/a";
    const avgDbMs     = notesOk ? (totalDbMs / notesOk).toFixed(0) : "n/a";

    console.log(`\n${"=".repeat(60)}`);
    console.log(`backfill complete in ${totalSec}s`);
    console.log(`  notes ok / failed:  ${notesOk} / ${notesFailed}`);
    console.log(`  chunks embedded:    ${totalEmbedded} / ${totalChunks}`);
    console.log(`  avg embed time:     ${avgMsPerChunk} ms/chunk`);
    console.log(`  avg db write time:  ${avgDbMs} ms/note`);
    console.log(`  total embed time:   ${(totalEmbedMs / 1000).toFixed(1)}s`);
    console.log(`  total db time:      ${(totalDbMs / 1000).toFixed(1)}s`);

    const [final] = await sql`
      SELECT COUNT(DISTINCT c.id)::int AS total_chunks,
             COUNT(DISTINCT e.chunk_id)::int AS embedded_chunks,
             COUNT(DISTINCT c.document_id)::int AS notes_indexed
      FROM app.chunks c LEFT JOIN app.embeddings e ON e.chunk_id = c.id
    `;
    console.log(`\nDB state: ${final.embedded_chunks}/${final.total_chunks} chunks embedded across ${final.notes_indexed} notes`);

  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
