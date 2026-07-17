import crypto from "node:crypto";
import sql from "@/database/pgsql.js";
import { deleteChunkVectors, getChunkVectors, upsertChunkVectors } from "@/lib/qdrant";
import { getStorageProvider } from "@/lib/storage/init";
import { markerAssetKey, sanitizeMarkerAssetName } from "@/lib/marker-output";

const CACHE_QDRANT_USER = "__imported_file_cache__";
const NOTE_ASSET_CAPTURE_RE = /\/api\/notes\/([0-9a-f-]{36})\/assets\?name=([^\s)]+)/gi;

// Bump this whenever extraction, chunking, Marker policy, or the embedding
// model changes in a way that makes old derived artifacts incompatible.
export const IMPORT_PIPELINE_VERSION =
  process.env.IMPORT_PIPELINE_VERSION?.trim() ||
  `${process.env.EMBEDDING_MODEL?.trim() || "default"}:${process.env.QDRANT_VECTOR_SIZE?.trim() || process.env.EMBEDDING_DIMENSIONS?.trim() || "default"}:v1`;

export interface ImportedFileCacheRow {
  id: string;
  sha256: string;
  pipeline_version: string;
  mime_type: string;
  file_size: string | number;
  storage_key: string;
  status: "processing" | "ready" | "failed";
  replayable: boolean;
  extracted_markdown: string | null;
  extracted_text: string | null;
  extraction_coverage: Record<string, unknown> | null;
}

interface CacheChunkRow { id: string; text: string; ordinal: number }

export interface CanvasFileSource {
  tenant: string;
  externalFileId: string;
  versionToken: string;
  fileSize: number;
  mimeType: string;
}

export function canvasFileSource(params: {
  baseUrl?: string | null;
  file?: Record<string, unknown> | null;
  mimeType?: string | null;
}): CanvasFileSource | null {
  const file = params.file;
  if (!file || !params.baseUrl || !params.mimeType) return null;
  let tenant: string;
  try { tenant = new URL(params.baseUrl).host.toLowerCase(); }
  catch { return null; }
  const externalFileId = String(file.id ?? "").trim();
  const versionToken = String(file.updated_at ?? "").trim();
  const rawSize = typeof file.size === "number" ? file.size : Number(file.size);
  if (!externalFileId || !versionToken || !Number.isSafeInteger(rawSize) || rawSize < 0) {
    return null;
  }
  return { tenant, externalFileId, versionToken, fileSize: rawSize,
    mimeType: params.mimeType };
}

function signed32Bit(value: number): number {
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function advisoryLockKey(sha256: string): [number, number] {
  return [
    signed32Bit(Number.parseInt(sha256.slice(0, 8), 16)),
    signed32Bit(Number.parseInt(sha256.slice(8, 16), 16)),
  ];
}

export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function importedFileStorageKey(sha256: string, _filename?: string): string {
  // This cache currently accepts PDFs only. Keeping the key independent of
  // user-controlled filenames makes renames and misleading extensions safe.
  return `imports/shared/${sha256}.pdf`;
}

export function isSharedImportedFileKey(key: string | null): boolean {
  return Boolean(key?.startsWith("imports/shared/"));
}

export function isReplayableImportedMarkdown(markdown: string | null): boolean {
  return Boolean(markdown?.trim());
}

export async function withImportedFileLock<T>(sha256: string, fn: () => Promise<T>): Promise<T> {
  const [key1, key2] = advisoryLockKey(sha256);
  // Transaction-scoped locks cannot leak if work throws or a pooled connection
  // changes. Cache writes inside fn remain independently recoverable.
  return sql.begin(async (tx: any) => {
    await tx`SELECT pg_advisory_xact_lock(${key1}, ${key2})`;
    return fn();
  });
}

export async function getImportedFileCacheBySha(sha256: string): Promise<ImportedFileCacheRow | null> {
  const [row] = await sql`
    SELECT * FROM app.imported_file_cache
    WHERE sha256 = ${sha256} AND pipeline_version = ${IMPORT_PIPELINE_VERSION}
    LIMIT 1
  `;
  return (row as ImportedFileCacheRow | undefined) ?? null;
}

export async function getImportedFileCacheByCanvasSource(
  source: CanvasFileSource,
): Promise<ImportedFileCacheRow | null> {
  const [row] = await sql`
    SELECT cache.*
    FROM app.imported_file_sources source
    JOIN app.imported_file_cache cache ON cache.id = source.cache_id
    WHERE source.provider = 'canvas'
      AND source.tenant = ${source.tenant}
      AND source.external_file_id = ${source.externalFileId}
      AND source.version_token = ${source.versionToken}
      AND source.file_size = ${source.fileSize}
      AND source.mime_type = ${source.mimeType}
      AND cache.pipeline_version = ${IMPORT_PIPELINE_VERSION}
      AND cache.status = 'ready'
      AND cache.replayable = TRUE
    LIMIT 1
  `;
  return (row as ImportedFileCacheRow | undefined) ?? null;
}

export async function recordImportedFileCanvasSource(
  cacheId: string,
  source: CanvasFileSource | null,
): Promise<void> {
  if (!source) return;
  await sql`
    INSERT INTO app.imported_file_sources
      (cache_id, provider, tenant, external_file_id, version_token,
       file_size, mime_type, verified_at)
    VALUES (${cacheId}::uuid, 'canvas', ${source.tenant},
      ${source.externalFileId}, ${source.versionToken}, ${source.fileSize},
      ${source.mimeType}, NOW())
    ON CONFLICT (provider, tenant, external_file_id, version_token, file_size, mime_type)
    DO UPDATE SET cache_id = EXCLUDED.cache_id, verified_at = NOW()
  `;
}

export async function ensureImportedFileCacheRow(params: {
  sha256: string; mimeType: string; fileSize: number; storageKey: string;
}): Promise<ImportedFileCacheRow> {
  const [row] = await sql`
    INSERT INTO app.imported_file_cache
      (sha256, pipeline_version, mime_type, file_size, storage_key, status,
       replayable, processing_started_at, updated_at)
    VALUES (${params.sha256}, ${IMPORT_PIPELINE_VERSION}, ${params.mimeType},
      ${params.fileSize}, ${params.storageKey}, 'processing', FALSE, NOW(), NOW())
    ON CONFLICT (sha256, pipeline_version) DO UPDATE SET
      status = 'processing', replayable = FALSE, error_message = NULL,
      processing_started_at = NOW(), updated_at = NOW()
    RETURNING *
  `;
  return row as ImportedFileCacheRow;
}

export async function markImportedFileCacheFailed(cacheId: string, message: string): Promise<void> {
  await sql`
    UPDATE app.imported_file_cache SET status = 'failed', replayable = FALSE,
      error_message = ${message}, updated_at = NOW()
    WHERE id = ${cacheId}::uuid
  `;
}

export async function captureImportedPdfCache(params: {
  cacheId: string; sourceNoteId: string;
}): Promise<{ replayable: boolean }> {
  const [note] = await sql`
    SELECT content, extracted_text, extraction_coverage, user_id FROM app.notes
    WHERE note_id = ${params.sourceNoteId}::uuid LIMIT 1
  `;
  if (!note) {
    await markImportedFileCacheFailed(params.cacheId, "Cache source note missing");
    return { replayable: false };
  }

  const markdown = typeof note.content === "string" ? note.content : "";
  let replayable = isReplayableImportedMarkdown(markdown);
  const assetMatches = [...markdown.matchAll(NOTE_ASSET_CAPTURE_RE)];
  const storage = getStorageProvider();
  const cachedAssetMap = new Map<string, string>();
  for (const match of assetMatches) {
    const name = sanitizeMarkerAssetName(decodeURIComponent(match[2]));
    if (!name) { replayable = false; continue; }
    const sourceKey = markerAssetKey(String(note.user_id), String(match[1]), name);
    const storageKey = `imports/shared-assets/${params.cacheId}/${name}`;
    if (cachedAssetMap.has(name)) continue;
    try {
      await storage.copyObject(sourceKey, storageKey, {});
      cachedAssetMap.set(name, storageKey);
    } catch {
      replayable = false;
    }
  }
  const cachedAssets = [...cachedAssetMap].map(([name, storageKey]) => ({ name, storageKey }));
  const sourceChunks = (await sql`
    SELECT id, text, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS ordinal
    FROM app.chunks WHERE document_id = ${params.sourceNoteId}::uuid
    ORDER BY created_at, id
  `) as CacheChunkRow[];
  const vectors = await getChunkVectors(sourceChunks.map((chunk) => chunk.id));
  const vectorById = new Map(vectors.map((item) => [item.chunkId, item.vector]));

  const prior = (await sql`
    SELECT id FROM app.imported_file_cache_chunks WHERE cache_id = ${params.cacheId}::uuid
  `) as Array<{ id: string }>;
  await deleteChunkVectors(prior.map((row: { id: string }) => row.id)).catch(() => undefined);

  const cachedRows: Array<{ id: string; ordinal: number }> = await sql.begin(async (tx: any) => {
    await tx`DELETE FROM app.imported_file_cache_chunks WHERE cache_id = ${params.cacheId}::uuid`;
    await tx`DELETE FROM app.imported_file_cache_assets WHERE cache_id = ${params.cacheId}::uuid`;
    if (cachedAssets.length) {
      await tx`
        INSERT INTO app.imported_file_cache_assets (cache_id, name, storage_key)
        SELECT * FROM UNNEST(${cachedAssets.map(() => params.cacheId)}::uuid[],
          ${cachedAssets.map((asset) => asset.name)}::text[],
          ${cachedAssets.map((asset) => asset.storageKey)}::text[])
      `;
    }
    const inserted = sourceChunks.length === 0 ? [] : await tx`
      INSERT INTO app.imported_file_cache_chunks (cache_id, ordinal, text)
      SELECT * FROM UNNEST(
        ${sourceChunks.map(() => params.cacheId)}::uuid[],
        ${sourceChunks.map((chunk) => Number(chunk.ordinal))}::int[],
        ${sourceChunks.map((chunk) => chunk.text)}::text[])
      RETURNING id, ordinal
    `;
    await tx`
      UPDATE app.imported_file_cache SET status = 'ready', replayable = ${replayable},
        extracted_markdown = ${markdown}, extracted_text = ${note.extracted_text ?? null},
        extraction_coverage = ${JSON.stringify(note.extraction_coverage ?? null)}::jsonb,
        error_message = NULL, updated_at = NOW()
      WHERE id = ${params.cacheId}::uuid
    `;
    await tx`
      UPDATE app.notes SET imported_file_cache_id = ${params.cacheId}::uuid,
        updated_at = NOW()
      WHERE note_id = ${params.sourceNoteId}::uuid
    `;
    return inserted as Array<{ id: string; ordinal: number }>;
  });

  const points = cachedRows.flatMap((row) => {
    const source = sourceChunks.find((chunk) => Number(chunk.ordinal) === row.ordinal);
    const vector = source ? vectorById.get(source.id) : undefined;
    return vector ? [{ chunkId: row.id, documentId: params.cacheId,
      userId: CACHE_QDRANT_USER, vector }] : [];
  });
  if (points.length) await upsertChunkVectors(points);
  return { replayable };
}

export async function cloneImportedPdfCacheToNote(params: {
  cacheId: string; noteId: string; userId: string; onlyIfEmpty?: boolean;
}): Promise<number> {
  const [cache] = await sql`
    SELECT extracted_markdown, extracted_text, extraction_coverage
    FROM app.imported_file_cache WHERE id = ${params.cacheId}::uuid
      AND status = 'ready' AND replayable = TRUE LIMIT 1
  `;
  if (!cache) return 0;
  if (params.onlyIfEmpty) {
    const [note] = await sql`SELECT content FROM app.notes WHERE note_id = ${params.noteId}::uuid`;
    if (note?.content?.trim()) return 0;
  }

  const cached = (await sql`
    SELECT id, text, ordinal FROM app.imported_file_cache_chunks
    WHERE cache_id = ${params.cacheId}::uuid ORDER BY ordinal
  `) as CacheChunkRow[];
  const old = (await sql`
    SELECT id FROM app.chunks WHERE document_id = ${params.noteId}::uuid
      AND user_id = ${params.userId}::uuid
  `) as Array<{ id: string }>;
  await deleteChunkVectors(old.map((row) => row.id)).catch(() => undefined);
  await sql`DELETE FROM app.chunks WHERE document_id = ${params.noteId}::uuid AND user_id = ${params.userId}::uuid`;
  const replayMarkdown = String(cache.extracted_markdown ?? "").replace(
    /\/api\/notes\/[0-9a-f-]{36}\/assets\?name=/gi,
    `/api/notes/${params.noteId}/assets?name=`,
  );
  await sql`
    UPDATE app.notes SET content = ${replayMarkdown},
      extracted_text = ${cache.extracted_text ?? null},
      extraction_coverage = ${JSON.stringify(cache.extraction_coverage ?? null)}::jsonb,
      imported_file_cache_id = ${params.cacheId}::uuid, updated_at = NOW()
    WHERE note_id = ${params.noteId}::uuid AND user_id = ${params.userId}::uuid
  `;
  if (!cached.length) return 0;
  const inserted = (await sql`
    INSERT INTO app.chunks (document_id, user_id, text)
    SELECT * FROM UNNEST(${cached.map(() => params.noteId)}::uuid[],
      ${cached.map(() => params.userId)}::uuid[], ${cached.map((row) => row.text)}::text[])
    RETURNING id
  `) as Array<{ id: string }>;
  const vectors = await getChunkVectors(cached.map((row) => row.id));
  const byId = new Map(vectors.map((item) => [item.chunkId, item.vector]));
  const points = inserted.flatMap((row, index) => {
    const vector = byId.get(cached[index].id);
    return vector ? [{ chunkId: row.id, documentId: params.noteId,
      userId: params.userId, vector }] : [];
  });
  if (points.length) await upsertChunkVectors(points);
  return inserted.length;
}
