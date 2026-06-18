#!/usr/bin/env node

/**
 * Deep vector-search benchmark for pgvector vs Qdrant.
 *
 * Example:
 *   node scripts/benchmark-vector-search-deep.mjs \
 *     --env-file=/home/semyon/jenkins/env/oghma-prod.env \
 *     --qdrant-url=http://127.0.0.1:6333 \
 *     --collection=oghma_prod_benchmark_deep \
 *     --queries=25 --top-k=10 --seed=42
 */

import { existsSync, readFileSync } from "fs";
import postgres from "postgres";
import { performance } from "perf_hooks";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function intArg(name, fallback) {
  const parsed = Number.parseInt(arg(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function localizeDockerHost(url) {
  return url.replace("@oghma-postgres:", "@192.168.48.10:");
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

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function summarize(values) {
  return {
    min: Math.min(...values),
    median: percentile(values, 50),
    avg: values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1),
    p95: percentile(values, 95),
    max: Math.max(...values),
  };
}

function fmt(ms) {
  return `${ms.toFixed(2)}ms`;
}

function overlap(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((id) => actualSet.has(id)).length / Math.max(expected.length, 1);
}

function printSummary(label, clientTimes, serverTimes, recalls) {
  const client = summarize(clientTimes);
  const server = serverTimes.length > 0 ? summarize(serverTimes) : null;
  const recall = recalls.length > 0 ? summarize(recalls.map((value) => value * 100)) : null;
  console.log(
    [
      label.padEnd(24),
      fmt(client.median).padStart(10),
      fmt(client.avg).padStart(10),
      fmt(client.p95).padStart(10),
      server ? fmt(server.median).padStart(10) : "n/a".padStart(10),
      server ? fmt(server.p95).padStart(10) : "n/a".padStart(10),
      recall ? `${recall.avg.toFixed(1)}%`.padStart(9) : "n/a".padStart(9),
    ].join("  "),
  );
}

async function qdrantSearch({
  qdrantUrl,
  collection,
  vector,
  topK,
  userId,
  ef,
  exact,
}) {
  const body = {
    vector,
    limit: topK,
    with_payload: true,
    with_vector: false,
    params: exact ? { exact: true } : { hnsw_ef: ef },
  };
  if (userId) {
    body.filter = {
      must: [{ key: "user_id", match: { value: userId } }],
    };
  }

  const start = performance.now();
  const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const clientMs = performance.now() - start;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qdrant search failed ${res.status}: ${text}`);
  }
  const json = await res.json();
  return {
    ids: (json.result || []).map((point) => point.payload?.chunk_id || String(point.id)),
    clientMs,
    serverMs: Number(json.time || 0) * 1000,
  };
}

async function pgClientGlobal(sql, vector, topK) {
  const vText = vectorText(vector);
  const start = performance.now();
  const rows = await sql`
    SELECT chunk_id::text AS chunk_id
    FROM app.embeddings
    ORDER BY embedding <=> ${vText}::vector
    LIMIT ${topK}
  `;
  return {
    ids: rows.map((row) => row.chunk_id),
    clientMs: performance.now() - start,
  };
}

async function pgClientUser(sql, vector, topK, userId) {
  const vText = vectorText(vector);
  const start = performance.now();
  const rows = await sql`
    SELECT e.chunk_id::text AS chunk_id
    FROM app.embeddings e
    JOIN app.chunks c ON c.id = e.chunk_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY e.embedding <=> ${vText}::vector
    LIMIT ${topK}
  `;
  return {
    ids: rows.map((row) => row.chunk_id),
    clientMs: performance.now() - start,
  };
}

async function pgExplain(sql, vector, topK, userId = null) {
  const vText = vectorText(vector);
  const rows = userId
    ? await sql`
        EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF)
        SELECT e.chunk_id::text AS chunk_id
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        WHERE c.user_id = ${userId}::uuid
        ORDER BY e.embedding <=> ${vText}::vector
        LIMIT ${topK}
      `
    : await sql`
        EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF)
        SELECT chunk_id::text AS chunk_id
        FROM app.embeddings
        ORDER BY embedding <=> ${vText}::vector
        LIMIT ${topK}
      `;
  return Number(rows[0]["QUERY PLAN"][0]["Execution Time"]);
}

async function runStress({ qdrantUrl, collection, samples, topK, ef, concurrency, durationMs }) {
  let index = 0;
  let completed = 0;
  let failed = 0;
  const latencies = [];
  const endAt = performance.now() + durationMs;

  async function worker() {
    while (performance.now() < endAt) {
      const sample = samples[index % samples.length];
      index += 1;
      try {
        const result = await qdrantSearch({
          qdrantUrl,
          collection,
          vector: sample.vector,
          topK,
          userId: sample.user_id,
          ef,
          exact: false,
        });
        latencies.push(result.clientMs);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSec = (performance.now() - start) / 1000;
  return {
    concurrency,
    completed,
    failed,
    qps: completed / elapsedSec,
    latency: summarize(latencies),
  };
}

async function main() {
  const envFile = arg("env-file", ".env.local");
  const env = parseEnvFile(envFile);
  const dbUrl = localizeDockerHost(
    arg("database-url", env.MIGRATION_DATABASE_URL || env.DATABASE_URL || ""),
  );
  if (!dbUrl) throw new Error("DATABASE_URL missing");

  const qdrantUrl = arg("qdrant-url", "http://127.0.0.1:6333").replace(/\/+$/, "");
  const collection = arg("collection", "oghma_prod_benchmark_deep");
  const queries = intArg("queries", 25);
  const topK = intArg("top-k", 10);
  const seed = arg("seed", "42");
  const efValues = arg("ef", "64,128,256")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const stressSeconds = intArg("stress-seconds", 10);
  const stressConcurrency = arg("stress-concurrency", "1,4,8,16")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 3,
    connect_timeout: 15,
  });

  try {
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM app.embeddings) AS embeddings,
        (SELECT COUNT(*)::int FROM app.chunks) AS chunks,
        (SELECT COUNT(DISTINCT document_id)::int FROM app.chunks) AS notes,
        (SELECT COUNT(DISTINCT user_id)::int FROM app.chunks) AS users
    `;

    const samplesRaw = await sql`
      SELECT e.chunk_id::text AS chunk_id,
             c.user_id::text AS user_id,
             e.embedding::text AS embedding
      FROM app.embeddings e
      JOIN app.chunks c ON c.id = e.chunk_id
      ORDER BY md5(e.chunk_id::text || ${seed})
      LIMIT ${queries}
    `;
    const samples = samplesRaw.map((row) => ({
      ...row,
      vector: parseVector(row.embedding),
    }));

    console.log("Dataset");
    console.log(JSON.stringify({ ...counts, queries, topK, seed, collection }, null, 2));

    const scenarios = new Map();
    function add(label, clientMs, serverMs, recall) {
      if (!scenarios.has(label)) scenarios.set(label, { client: [], server: [], recall: [] });
      scenarios.get(label).client.push(clientMs);
      if (serverMs != null) scenarios.get(label).server.push(serverMs);
      if (recall != null) scenarios.get(label).recall.push(recall);
    }

    for (const sample of samples) {
      const pgGlobal = await pgClientGlobal(sql, sample.vector, topK);
      const pgUser = await pgClientUser(sql, sample.vector, topK, sample.user_id);
      add("pg global client", pgGlobal.clientMs, await pgExplain(sql, sample.vector, topK), null);
      add("pg user client", pgUser.clientMs, await pgExplain(sql, sample.vector, topK, sample.user_id), null);

      for (const ef of efValues) {
        const qGlobal = await qdrantSearch({
          qdrantUrl,
          collection,
          vector: sample.vector,
          topK,
          ef,
          exact: false,
        });
        const qUser = await qdrantSearch({
          qdrantUrl,
          collection,
          vector: sample.vector,
          topK,
          userId: sample.user_id,
          ef,
          exact: false,
        });
        add(`qdrant ef${ef} global`, qGlobal.clientMs, qGlobal.serverMs, overlap(pgGlobal.ids, qGlobal.ids));
        add(`qdrant ef${ef} user`, qUser.clientMs, qUser.serverMs, overlap(pgUser.ids, qUser.ids));
      }

      const qExactGlobal = await qdrantSearch({
        qdrantUrl,
        collection,
        vector: sample.vector,
        topK,
        exact: true,
      });
      const qExactUser = await qdrantSearch({
        qdrantUrl,
        collection,
        vector: sample.vector,
        topK,
        userId: sample.user_id,
        exact: true,
      });
      add("qdrant exact global", qExactGlobal.clientMs, qExactGlobal.serverMs, overlap(pgGlobal.ids, qExactGlobal.ids));
      add("qdrant exact user", qExactUser.clientMs, qExactUser.serverMs, overlap(pgUser.ids, qExactUser.ids));
    }

    console.log("\nLatency / Recall");
    console.log(
      [
        "scenario".padEnd(24),
        "client p50".padStart(10),
        "client avg".padStart(10),
        "client p95".padStart(10),
        "server p50".padStart(10),
        "server p95".padStart(10),
        "recall".padStart(9),
      ].join("  "),
    );
    for (const [label, values] of scenarios) {
      printSummary(label, values.client, values.server, values.recall);
    }

    console.log(`\nQdrant user-scope stress, ef=${efValues[0]}, topK=${topK}, duration=${stressSeconds}s`);
    console.log("conc  qps       p50       avg       p95       max       errors");
    for (const concurrency of stressConcurrency) {
      const result = await runStress({
        qdrantUrl,
        collection,
        samples,
        topK,
        ef: efValues[0],
        concurrency,
        durationMs: stressSeconds * 1000,
      });
      console.log(
        [
          String(result.concurrency).padEnd(5),
          result.qps.toFixed(1).padEnd(8),
          fmt(result.latency.median).padEnd(9),
          fmt(result.latency.avg).padEnd(9),
          fmt(result.latency.p95).padEnd(9),
          fmt(result.latency.max).padEnd(9),
          String(result.failed),
        ].join("  "),
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[vector-deep-benchmark] failed:", error.message);
  process.exit(1);
});
