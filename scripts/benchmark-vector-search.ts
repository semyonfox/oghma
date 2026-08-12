#!/usr/bin/env node

/**
 * Compares old pgvector search against the new Qdrant vector store.
 *
 * Run before migration 030 drops app.embeddings:
 *   node --experimental-strip-types scripts/migrate-pgvector-to-qdrant.ts
 *   node --experimental-strip-types scripts/benchmark-vector-search.ts --queries=50 --top-k=20 --warmup=5
 */

import fs from "fs";
import path from "path";
import postgres from "postgres";
import { performance } from "perf_hooks";

const DEFAULT_COLLECTION = "oghma_chunks";

type BenchmarkSample = {
  chunk_id: string;
  user_id: string;
  embedding: string;
};

type NumberSummary = {
  avg: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadEnv(): void {
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

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function intArg(name: string, fallback: number): number {
  const parsed = Number.parseInt(arg(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseVector(value: string): number[] {
  return String(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => Number(part));
}

function vectorText(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

function qdrantUrl(): string {
  return (process.env.QDRANT_URL || "http://127.0.0.1:6333").replace(/\/+$/, "");
}

function qdrantCollection(): string {
  return process.env.QDRANT_COLLECTION || DEFAULT_COLLECTION;
}

function qdrantHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.QDRANT_API_KEY?.trim()) {
    headers["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return headers;
}

async function qdrantSearch({
  vector,
  userId,
  topK,
}: {
  vector: number[];
  userId: string;
  topK: number;
}): Promise<string[]> {
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

  const json: unknown = await res.json();
  const result = isRecord(json) && Array.isArray(json.result) ? json.result : [];
  return result.map((point) => {
    const pointRecord = isRecord(point) ? point : {};
    const payload = isRecord(pointRecord.payload) ? pointRecord.payload : {};
    const chunkId = payload.chunk_id;
    return typeof chunkId === "string" ? chunkId : String(pointRecord.id);
  });
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function summarize(values: readonly number[]): NumberSummary {
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return {
    avg,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function fmt(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

function overlap(left: readonly string[], right: readonly string[]): number {
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
    const [table] = await sql<{ table_name: string | null }[]>`SELECT to_regclass('app.embeddings') AS table_name`;
    if (!table?.table_name) {
      throw new Error("app.embeddings is already gone here; run this against a pre-030 database backup/environment");
    }

    const whereUser = userIdArg ? sql`AND c.user_id = ${userIdArg}::uuid` : sql``;
    const samples = await sql<BenchmarkSample[]>`
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

    const pgTimes: number[] = [];
    const qdrantTimes: number[] = [];
    const overlaps: number[] = [];
    const warmupCount = Math.min(warmup, samples.length);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const vector = parseVector(sample.embedding);
      const vText = vectorText(vector);

      const pgStart = performance.now();
      const pgRows = await sql<{ chunk_id: string }[]>`
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

main().catch((error: unknown) => {
  console.error("[vector-benchmark] failed:", asErrorMessage(error));
  process.exit(1);
});
