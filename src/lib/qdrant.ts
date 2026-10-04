import logger from "@/lib/logger";
import { config } from "@/lib/config";

const DEFAULT_COLLECTION = "oghma_chunks";
// Keep high-dimensional JSON vector requests comfortably below Qdrant's
// default 32 MiB HTTP payload limit. A single imported text file can produce
// hundreds of chunks, so point count must not map to one unbounded request.
const UPSERT_BATCH_SIZE = 128;

interface QdrantPointPayload {
  chunk_id: string;
  document_id: string;
  user_id: string;
  searchable: boolean;
}

interface QdrantSearchPoint {
  id: string | number;
  score: number;
  payload?: Partial<QdrantPointPayload>;
}

interface QdrantPointRecord {
  id: string | number;
  vector?: number[] | Record<string, number[]>;
  payload?: Partial<QdrantPointPayload>;
}

export interface ChunkVectorPoint {
  chunkId: string;
  documentId: string;
  userId: string;
  vector: number[];
}

export interface ChunkVectorHit {
  chunkId: string;
  documentId: string;
  userId: string;
  score: number;
  distance: number;
}

export interface ChunkVectorRecord {
  chunkId: string;
  vector: number[];
}

export interface SearchChunkVectorsParams {
  userId: string;
  vector: number[];
  limit: number;
  maxDistance?: number;
  documentIds?: string[] | null;
  excludeDocumentIds?: string[];
  excludeChunkIds?: string[];
}

let ensuredCollectionSize: number | null = null;

function qdrantCollectionConfig(vectorSize: number) {
  return {
    vectors: {
      size: vectorSize,
      distance: "Cosine",
    },
    hnsw_config: {
      m: 16,
      ef_construct: 100,
    },
    optimizers_config: {
      indexing_threshold: 1,
    },
  };
}

function qdrantUrl(): string {
  const configured = process.env.QDRANT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production"
    ? "http://oghma-qdrant:6333"
    : "http://127.0.0.1:6333";
}

export function qdrantCollection(): string {
  return process.env.QDRANT_COLLECTION?.trim() || DEFAULT_COLLECTION;
}

function qdrantHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
}

async function qdrantFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${qdrantUrl()}${path}`, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      ...qdrantHeaders(),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Qdrant ${init.method || "GET"} ${path} failed: ${res.status} ${body}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function createPayloadIndex(
  fieldName: string,
  fieldSchema: "keyword" | "bool" = "keyword",
  signal?: AbortSignal,
): Promise<void> {
  try {
    await qdrantFetch(`/collections/${qdrantCollection()}/index?wait=true`, {
      method: "PUT",
      signal,
      body: JSON.stringify({
        field_name: fieldName,
        field_schema: fieldSchema,
      }),
    });
  } catch (error) {
    signal?.throwIfAborted();
    logger.warn("qdrant payload index creation failed", {
      fieldName,
      fieldSchema,
      error,
    });
  }
}

export async function ensureQdrantCollection(vectorSize: number, signal?: AbortSignal): Promise<void> {
  if (ensuredCollectionSize === vectorSize) return;

  const collection = qdrantCollection();
  const existing = await fetch(`${qdrantUrl()}/collections/${collection}`, {
    headers: qdrantHeaders(),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  });

  if (existing.status === 404) {
    await qdrantFetch(`/collections/${collection}`, {
      method: "PUT",
      signal,
      body: JSON.stringify(qdrantCollectionConfig(vectorSize)),
    });
    await createPayloadIndex("user_id", "keyword", signal);
    await createPayloadIndex("document_id", "keyword", signal);
    await createPayloadIndex("searchable", "bool", signal);
    ensuredCollectionSize = vectorSize;
    return;
  }

  if (!existing.ok) {
    const body = await existing.text().catch(() => "");
    throw new Error(
      `Qdrant GET /collections/${collection} failed: ${existing.status} ${body}`,
    );
  }

  const json = await existing.json();
  const size = json?.result?.config?.params?.vectors?.size;
  if (typeof size === "number" && size !== vectorSize) {
    throw new Error(
      `Qdrant collection ${collection} has vector size ${size}, expected ${vectorSize}`,
    );
  }

  await qdrantFetch(`/collections/${collection}`, {
    method: "PATCH",
    signal,
    body: JSON.stringify({
      hnsw_config: qdrantCollectionConfig(vectorSize).hnsw_config,
      optimizers_config: qdrantCollectionConfig(vectorSize).optimizers_config,
    }),
  }).catch((error) => {
    signal?.throwIfAborted();
    logger.warn("qdrant collection index config update failed", {
      collection,
      error,
    });
  });
  await createPayloadIndex("user_id", "keyword", signal);
  await createPayloadIndex("document_id", "keyword", signal);
  await createPayloadIndex("searchable", "bool", signal);

  ensuredCollectionSize = vectorSize;
}

export async function upsertChunkVectors(
  points: ChunkVectorPoint[],
): Promise<void> {
  if (points.length === 0) return;
  // One deadline covers every batch and collection setup while the caller
  // holds a note lock. Keep headroom before PostgreSQL's idle transaction limit.
  const signal = AbortSignal.timeout(Math.max(1, Math.min(15_000, Math.floor(config.db.transactionTimeoutMs / 2))));
  await ensureQdrantCollection(points[0].vector.length, signal);

  for (let offset = 0; offset < points.length; offset += UPSERT_BATCH_SIZE) {
    const batch = points.slice(offset, offset + UPSERT_BATCH_SIZE);
    await qdrantFetch(`/collections/${qdrantCollection()}/points?wait=true`, {
      method: "PUT",
      signal,
      body: JSON.stringify({
        points: batch.map((point) => ({
          id: point.chunkId,
          vector: point.vector,
          payload: {
            chunk_id: point.chunkId,
            document_id: point.documentId,
            user_id: point.userId,
            searchable: true,
          },
        })),
      }),
    });
  }
}

export async function deleteChunkVectors(chunkIds: string[]): Promise<void> {
  const ids = [...new Set(chunkIds)].filter(Boolean);
  if (ids.length === 0) return;

  await qdrantFetch(`/collections/${qdrantCollection()}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({ points: ids }),
  });
}

/**
 * Toggle whether stored vectors participate in semantic search without
 * discarding them. Newly indexed points are searchable by default; points
 * written before this field existed remain searchable because the query filter
 * only excludes an explicit `false` value.
 */
export async function setChunkVectorsSearchable(
  chunkIds: string[],
  searchable: boolean,
): Promise<void> {
  const ids = [...new Set(chunkIds)].filter(Boolean);
  if (ids.length === 0) return;

  await qdrantFetch(
    `/collections/${qdrantCollection()}/points/payload?wait=true`,
    {
      // POST sets only this key; PUT would overwrite user_id/document_id and
      // make the point unreachable after a Trash transition.
      method: "POST",
      body: JSON.stringify({
        payload: { searchable },
        points: ids,
      }),
    },
  );
}

function buildFilter({
  userId,
  documentIds,
  excludeDocumentIds,
  excludeChunkIds,
}: Pick<
  SearchChunkVectorsParams,
  "userId" | "documentIds" | "excludeDocumentIds" | "excludeChunkIds"
>) {
  const filter: {
    must: unknown[];
    must_not?: unknown[];
  } = {
    must: [{ key: "user_id", match: { value: userId } }],
  };

  if (documentIds && documentIds.length > 0) {
    filter.must.push({ key: "document_id", match: { any: documentIds } });
  }

  const mustNot: unknown[] = [];
  if (excludeDocumentIds && excludeDocumentIds.length > 0) {
    mustNot.push({ key: "document_id", match: { any: excludeDocumentIds } });
  }
  if (excludeChunkIds && excludeChunkIds.length > 0) {
    mustNot.push({ has_id: excludeChunkIds });
  }
  // Do not consume top-K recall with trashed notes. Missing values are kept
  // visible so older points continue to work until they are reindexed.
  mustNot.push({ key: "searchable", match: { value: false } });
  if (mustNot.length > 0) filter.must_not = mustNot;

  return filter;
}

function pointToHit(point: QdrantSearchPoint): ChunkVectorHit | null {
  const payload = point.payload;
  const chunkId = payload?.chunk_id || String(point.id);
  const documentId = payload?.document_id;
  const userId = payload?.user_id;
  if (!chunkId || !documentId || !userId) return null;

  return {
    chunkId,
    documentId,
    userId,
    score: point.score,
    distance: 1 - point.score,
  };
}

export async function searchChunkVectors({
  userId,
  vector,
  limit,
  maxDistance,
  documentIds,
  excludeDocumentIds,
  excludeChunkIds,
}: SearchChunkVectorsParams): Promise<ChunkVectorHit[]> {
  if (documentIds?.length === 0) return [];
  await ensureQdrantCollection(vector.length);

  const response = await qdrantFetch<{ result: QdrantSearchPoint[] }>(
    `/collections/${qdrantCollection()}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        filter: buildFilter({
          userId,
          documentIds,
          excludeDocumentIds,
          excludeChunkIds,
        }),
        limit,
        with_payload: true,
        with_vector: false,
      }),
    },
  );

  return (response.result ?? [])
    .map(pointToHit)
    .filter((hit): hit is ChunkVectorHit => {
      if (!hit) return false;
      return maxDistance == null || hit.distance < maxDistance;
    });
}

export async function getChunkVector(chunkId: string): Promise<number[] | null> {
  const response = await qdrantFetch<{ result: QdrantPointRecord[] }>(
    `/collections/${qdrantCollection()}/points`,
    {
      method: "POST",
      body: JSON.stringify({
        ids: [chunkId],
        with_payload: false,
        with_vector: true,
      }),
    },
  );

  const vector = response.result?.[0]?.vector;
  if (Array.isArray(vector)) return vector;
  return null;
}

export async function getChunkVectors(chunkIds: string[]): Promise<ChunkVectorRecord[]> {
  const ids = [...new Set(chunkIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const response = await qdrantFetch<{ result: QdrantPointRecord[] }>(
    `/collections/${qdrantCollection()}/points`,
    { method: "POST", body: JSON.stringify({ ids, with_payload: true, with_vector: true }) },
  );
  return (response.result ?? []).flatMap((point) => {
    const vector = point.vector;
    const chunkId = point.payload?.chunk_id || String(point.id);
    return chunkId && Array.isArray(vector) ? [{ chunkId, vector }] : [];
  });
}
