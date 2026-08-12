#!/usr/bin/env node

import postgres from "postgres";

const DEFAULT_COLLECTION = "oghma_chunks";
const DEFAULT_VECTOR_SIZE = 4096;

interface TableNameRow {
  table_name: string | null;
}

interface CountRow {
  count: number;
}

interface EmbeddingRow {
  embedding: string;
}

interface ChunkEmbeddingRow extends EmbeddingRow {
  chunk_id: string;
  document_id: string;
  user_id: string;
}

interface QdrantCollectionResponse {
  result?: {
    config?: {
      params?: {
        vectors?: {
          size?: unknown;
        };
      };
    };
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQdrantCollectionResponse(
  value: unknown,
): value is QdrantCollectionResponse {
  return typeof value === "object" && value !== null;
}

function qdrantUrl(): string {
  const configured = process.env.QDRANT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production"
    ? "http://oghma-qdrant:6333"
    : "http://127.0.0.1:6333";
}

function qdrantCollection(): string {
  const configured = process.env.QDRANT_COLLECTION?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("QDRANT_COLLECTION must be set for production migrations");
  }
  return DEFAULT_COLLECTION;
}

function headers(): Record<string, string> {
  const out: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.QDRANT_API_KEY?.trim()) {
    out["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return out;
}

async function qdrantFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const requestHeaders = new Headers(headers());
  new Headers(init.headers).forEach((value, name) => {
    requestHeaders.set(name, value);
  });
  const res = await fetch(`${qdrantUrl()}${path}`, {
    ...init,
    headers: requestHeaders,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qdrant ${init.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined;
  return await res.json();
}

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  return String(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => Number(part));
}

function collectionConfig(size: number) {
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

async function ensureCollection(size: number): Promise<void> {
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
      }).catch((error: unknown) => {
        console.warn(
          `[pgvector-to-qdrant] payload index ${fieldName} failed: ${errorMessage(error)}`,
        );
      });
    }
    return;
  }

  if (!existing.ok) {
    const body = await existing.text().catch(() => "");
    throw new Error(`Qdrant collection check failed: ${existing.status} ${body}`);
  }

  const json: unknown = await existing.json();
  const actualSize = isQdrantCollectionResponse(json)
    ? json.result?.config?.params?.vectors?.size
    : undefined;
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
  }).catch((error: unknown) => {
    console.warn(
      `[pgvector-to-qdrant] index config update failed: ${errorMessage(error)}`,
    );
  });
  for (const fieldName of ["user_id", "document_id"]) {
    await qdrantFetch(`/collections/${collection}/index?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ field_name: fieldName, field_schema: "keyword" }),
    }).catch((error: unknown) => {
      console.warn(
        `[pgvector-to-qdrant] payload index ${fieldName} failed: ${errorMessage(error)}`,
      );
    });
  }
}

async function main(): Promise<void> {
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
    const [table] = await sql<TableNameRow[]>`
      SELECT to_regclass('app.embeddings') AS table_name
    `;
    if (!table?.table_name) {
      console.log("[pgvector-to-qdrant] app.embeddings does not exist, skipping");
      return;
    }

    const [countRow] = await sql<CountRow[]>`
      SELECT COUNT(*)::int AS count FROM app.embeddings
    `;
    const [activeCountRow] = await sql<CountRow[]>`
      SELECT COUNT(*)::int AS count
      FROM app.embeddings e
      JOIN app.chunks c ON c.id = e.chunk_id
      JOIN app.notes n ON n.note_id = c.document_id AND n.user_id = c.user_id
      WHERE n.deleted_at IS NULL
    `;
    if (!countRow || !activeCountRow) {
      throw new Error("pgvector count query returned no row");
    }
    if (countRow.count === 0) {
      await ensureCollection(
        Number.parseInt(process.env.QDRANT_VECTOR_SIZE || "", 10) || DEFAULT_VECTOR_SIZE,
      );
      console.log("[pgvector-to-qdrant] no pgvector rows to copy");
      return;
    }

    const [sample] = await sql<EmbeddingRow[]>`
      SELECT embedding::text AS embedding
      FROM app.embeddings
      LIMIT 1
    `;
    if (!sample) throw new Error("pgvector row disappeared while sampling");
    const vectorSize = parseVector(sample.embedding).length;
    await ensureCollection(vectorSize);

    const batchSize = Number.parseInt(process.env.QDRANT_MIGRATION_BATCH_SIZE || "64", 10);
    let copied = 0;
    let lastChunkId = "00000000-0000-0000-0000-000000000000";

    while (true) {
      const rows = await sql<ChunkEmbeddingRow[]>`
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
      const lastRow = rows.at(-1);
      if (!lastRow) break;
      lastChunkId = lastRow.chunk_id;
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

main().catch((error: unknown) => {
  console.error("[pgvector-to-qdrant] failed:", errorMessage(error));
  process.exit(1);
});
