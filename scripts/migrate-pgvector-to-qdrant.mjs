#!/usr/bin/env node

import postgres from "postgres";

const DEFAULT_COLLECTION = "oghma_chunks";
const DEFAULT_VECTOR_SIZE = 4096;

function qdrantUrl() {
  const configured = process.env.QDRANT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production"
    ? "http://oghma-qdrant:6333"
    : "http://127.0.0.1:6333";
}

function qdrantCollection() {
  const configured = process.env.QDRANT_COLLECTION?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("QDRANT_COLLECTION must be set for production migrations");
  }
  return DEFAULT_COLLECTION;
}

function headers() {
  const out = { "content-type": "application/json" };
  if (process.env.QDRANT_API_KEY?.trim()) {
    out["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return out;
}

async function qdrantFetch(path, init = {}) {
  const res = await fetch(`${qdrantUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qdrant ${init.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined;
  return await res.json();
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  return String(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => Number(part));
}

function collectionConfig(size) {
  return {
    vectors: { size, distance: "Cosine" },
    hnsw_config: {
      m: 16,
      ef_construct: 100,
    },
    optimizers_config: {
      indexing_threshold: 1,
    },
  };
}

async function ensureCollection(size) {
  const collection = qdrantCollection();
  const existing = await fetch(`${qdrantUrl()}/collections/${collection}`, {
    headers: headers(),
  });

  if (existing.status === 404) {
    await qdrantFetch(`/collections/${collection}`, {
      method: "PUT",
      body: JSON.stringify(collectionConfig(size)),
    });
    for (const fieldName of ["user_id", "document_id"]) {
      await qdrantFetch(`/collections/${collection}/index?wait=true`, {
        method: "PUT",
        body: JSON.stringify({ field_name: fieldName, field_schema: "keyword" }),
      }).catch((error) => {
        console.warn(`[pgvector-to-qdrant] payload index ${fieldName} failed: ${error.message}`);
      });
    }
    return;
  }

  if (!existing.ok) {
    const body = await existing.text().catch(() => "");
    throw new Error(`Qdrant collection check failed: ${existing.status} ${body}`);
  }

  const json = await existing.json();
  const actualSize = json?.result?.config?.params?.vectors?.size;
  if (typeof actualSize === "number" && actualSize !== size) {
    throw new Error(
      `Qdrant collection ${collection} has vector size ${actualSize}, expected ${size}`,
    );
  }

  await qdrantFetch(`/collections/${collection}`, {
    method: "PATCH",
    body: JSON.stringify({
      hnsw_config: collectionConfig(size).hnsw_config,
      optimizers_config: collectionConfig(size).optimizers_config,
    }),
  }).catch((error) => {
    console.warn(`[pgvector-to-qdrant] index config update failed: ${error.message}`);
  });
  for (const fieldName of ["user_id", "document_id"]) {
    await qdrantFetch(`/collections/${collection}/index?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ field_name: fieldName, field_schema: "keyword" }),
    }).catch((error) => {
      console.warn(`[pgvector-to-qdrant] payload index ${fieldName} failed: ${error.message}`);
    });
  }
}

async function main() {
  const dbUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("[pgvector-to-qdrant] DATABASE_URL not set, skipping");
    return;
  }

  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  try {
    const [table] = await sql`SELECT to_regclass('app.embeddings') AS table_name`;
    if (!table?.table_name) {
      console.log("[pgvector-to-qdrant] app.embeddings does not exist, skipping");
      return;
    }

    const [countRow] = await sql`SELECT COUNT(*)::int AS count FROM app.embeddings`;
    const [activeCountRow] = await sql`
      SELECT COUNT(*)::int AS count
      FROM app.embeddings e
      JOIN app.chunks c ON c.id = e.chunk_id
      JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
      WHERE n.deleted_at IS NULL
    `;
    if (!countRow || countRow.count === 0) {
      await ensureCollection(
        Number.parseInt(process.env.QDRANT_VECTOR_SIZE || "", 10) || DEFAULT_VECTOR_SIZE,
      );
      console.log("[pgvector-to-qdrant] no pgvector rows to copy");
      return;
    }

    const [sample] = await sql`
      SELECT embedding::text AS embedding
      FROM app.embeddings
      LIMIT 1
    `;
    const vectorSize = parseVector(sample.embedding).length;
    await ensureCollection(vectorSize);

    const batchSize = Number.parseInt(process.env.QDRANT_MIGRATION_BATCH_SIZE || "64", 10);
    let copied = 0;
    let lastChunkId = "00000000-0000-0000-0000-000000000000";

    while (true) {
      const rows = await sql`
        SELECT
          e.chunk_id::text AS chunk_id,
          c.document_id::text AS document_id,
          c.user_id::text AS user_id,
          e.embedding::text AS embedding
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
        WHERE e.chunk_id > ${lastChunkId}::uuid
          AND n.deleted_at IS NULL
        ORDER BY e.chunk_id
        LIMIT ${batchSize}
      `;

      if (rows.length === 0) break;
      await qdrantFetch(`/collections/${qdrantCollection()}/points?wait=true`, {
        method: "PUT",
        body: JSON.stringify({
          points: rows.map((row) => ({
            id: row.chunk_id,
            vector: parseVector(row.embedding),
            payload: {
              chunk_id: row.chunk_id,
              document_id: row.document_id,
              user_id: row.user_id,
            },
          })),
        }),
      });

      copied += rows.length;
      lastChunkId = rows[rows.length - 1].chunk_id;
      console.log(`[pgvector-to-qdrant] copied ${copied}/${activeCountRow.count}`);
    }

    if (countRow.count !== activeCountRow.count) {
      console.log(
        `[pgvector-to-qdrant] skipped ${countRow.count - activeCountRow.count} stale embedding(s) for deleted notes`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[pgvector-to-qdrant] failed:", error.message);
  process.exit(1);
});
