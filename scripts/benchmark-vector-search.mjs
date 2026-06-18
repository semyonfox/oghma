#!/usr/bin/env node

/**
 * Compares old pgvector search against the new Qdrant vector store.
 *
 * Run before migration 030 drops app.embeddings:
 *   node scripts/migrate-pgvector-to-qdrant.mjs
 *   node scripts/benchmark-vector-search.mjs --queries=50 --top-k=20 --warmup=5
 */

import fs from "fs";
import path from "path";
import postgres from "postgres";
import { performance } from "perf_hooks";

const DEFAULT_COLLECTION = "oghma_chunks";

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

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function intArg(name, fallback) {
  const parsed = Number.parseInt(arg(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseVector(value) {
  return String(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => Number(part));
}

function vectorText(vector) {
  return `[${vector.join(",")}]`;
}

function qdrantUrl() {
  return (process.env.QDRANT_URL || "http://127.0.0.1:6333").replace(/\/+$/, "");
}

function qdrantCollection() {
  return process.env.QDRANT_COLLECTION || DEFAULT_COLLECTION;
}

function qdrantHeaders() {
  const headers = { "content-type": "application/json" };
  if (process.env.QDRANT_API_KEY?.trim()) {
    headers["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return headers;
}

async function qdrantSearch({ vector, userId, topK }) {
  const res = await fetch(`${qdrantUrl()}/collections/${qdrantCollection()}/points/search`, {
    method: "POST",
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vector,
      filter: {
        must: [{ key: "user_id", match: { value: userId } }],
      },
      limit: topK,
      with_payload: true,
      with_vector: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qdrant search failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  return (json.result || []).map((point) => point.payload?.chunk_id || String(point.id));
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function summarize(values) {
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return {
    avg,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function fmt(ms) {
  return `${ms.toFixed(2)}ms`;
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id)).length / Math.max(left.length, 1);
}

async function main() {
  loadEnv();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const queries = intArg("queries", 50);
  const topK = intArg("top-k", 20);
  const warmup = intArg("warmup", 5);
  const userIdArg = arg("user-id", "");

  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 2,
    connect_timeout: 15,
  });

  try {
    const [table] = await sql`SELECT to_regclass('app.embeddings') AS table_name`;
    if (!table?.table_name) {
      throw new Error("app.embeddings is already gone here; run this against a pre-030 database backup/environment");
    }

    const whereUser = userIdArg ? sql`AND c.user_id = ${userIdArg}::uuid` : sql``;
    const samples = await sql`
      SELECT e.chunk_id::text AS chunk_id,
             c.user_id::text AS user_id,
             e.embedding::text AS embedding
      FROM app.embeddings e
      JOIN app.chunks c ON c.id = e.chunk_id
      WHERE TRUE ${whereUser}
      ORDER BY random()
      LIMIT ${queries + warmup}
    `;

    if (samples.length === 0) throw new Error("no embeddings found to benchmark");

    console.log(`collection: ${qdrantCollection()} (${qdrantUrl()})`);
    console.log(`queries: ${samples.length - Math.min(warmup, samples.length)} measured, ${Math.min(warmup, samples.length)} warmup, topK=${topK}`);

    const pgTimes = [];
    const qdrantTimes = [];
    const overlaps = [];
    const warmupCount = Math.min(warmup, samples.length);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const vector = parseVector(sample.embedding);
      const vText = vectorText(vector);

      const pgStart = performance.now();
      const pgRows = await sql`
        SELECT e.chunk_id::text AS chunk_id
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        WHERE c.user_id = ${sample.user_id}::uuid
        ORDER BY e.embedding <=> ${vText}::vector
        LIMIT ${topK}
      `;
      const pgMs = performance.now() - pgStart;

      const qStart = performance.now();
      const qdrantIds = await qdrantSearch({
        vector,
        userId: sample.user_id,
        topK,
      });
      const qMs = performance.now() - qStart;

      if (index < warmupCount) continue;
      const pgIds = pgRows.map((row) => row.chunk_id);
      pgTimes.push(pgMs);
      qdrantTimes.push(qMs);
      overlaps.push(overlap(pgIds, qdrantIds));
    }

    const pg = summarize(pgTimes);
    const qd = summarize(qdrantTimes);
    const ov = summarize(overlaps.map((value) => value * 100));

    console.log("\nengine        avg       p50       p95       min       max");
    console.log(`pgvector      ${fmt(pg.avg).padEnd(9)} ${fmt(pg.p50).padEnd(9)} ${fmt(pg.p95).padEnd(9)} ${fmt(pg.min).padEnd(9)} ${fmt(pg.max)}`);
    console.log(`qdrant        ${fmt(qd.avg).padEnd(9)} ${fmt(qd.p50).padEnd(9)} ${fmt(qd.p95).padEnd(9)} ${fmt(qd.min).padEnd(9)} ${fmt(qd.max)}`);
    console.log(`\nspeedup avg: ${(pg.avg / qd.avg).toFixed(2)}x`);
    console.log(`top-${topK} overlap: avg ${ov.avg.toFixed(1)}%, p50 ${ov.p50.toFixed(1)}%, p95 ${ov.p95.toFixed(1)}%`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[vector-benchmark] failed:", error.message);
  process.exit(1);
});
