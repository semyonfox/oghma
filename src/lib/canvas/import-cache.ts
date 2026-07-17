import crypto from "node:crypto";
import sql from "@/database/pgsql.js";
import {
  deleteChunkVectors,
  getChunkVectors,
  upsertChunkVectors,
} from "@/lib/qdrant";

const CACHE_QDRANT_USER = "__imported_file_cache__";
const NOTE_ASSET_URL_RE = /\/api\/notes\/[0-9a-f-]{36}\/assets\?name=/i;

interface ImportedFileCacheRow {
  id: string;
  sha256: string;
  mime_type: string;
  file_size: string | number;
  storage_key: string;
  status: string;
  replayable: boolean;
  extracted_markdown: string | null;
  extracted_text: string | null;
  extraction_coverage: Record<string, unknown> | null;
  error_message: string | null;
}

interface ImportedFileCacheChunkRow {
  id: string;
  text: string;
}

function sanitizeFileSegment(value: string): string {
  const cleaned = (value ?? "")
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "document.pdf";
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

export function importedFileStorageKey(
  sha256: string,
  filename: string,
): string {
  const safeName = sanitizeFileSegment(filename);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "pdf";
  return `imports/shared/${sha256}.${ext || "pdf"}`;
}

export function isReplayableImportedMarkdown(markdown: string | null): boolean {
  if (!markdown?.trim()) return false;
  return !NOTE_ASSET_URL_RE.test(markdown);
}

export async function withImportedFileLock<T>(
  sha256: string,
  fn: () => Promise<T>,
): Promise<T> {
  const [key1, key2] = advisoryLockKey(sha256);
  await sql`SELECT pg_advisory_lock(${key1}, ${key2})`;
  try {
    return await fn();
  } finally {
    await sql`SELECT pg_advisory_unlock(${key1}, ${key2})`;
  }
}

export async function getImportedFileCacheBySha(
  sha256: string,
): Promise<ImportedFileCacheRow | null> {
  const [row] = await sql`
    SELECT *
    FROM app.imported_file_cache
    WHERE sha256 = ${sha256}
    LIMIT 1
  `;
  return (row as ImportedFileCacheRow | undefined) ?? null;
}

export async function ensureImportedFileCacheRow(params: {
  sha256: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
}): Promise<ImportedFileCacheRow> {
  const [row] = await sql`
    INSERT INTO app.imported_file_cache (
      sha256, mime_type, file_size, storage_key, status, updated_at
    )
    VALUES (
      ${params.sha256},
      ${params.mimeType},
      ${params.fileSize},
      ${params.storageKey},
      'processing',
      NOW()
    )
    ON CONFLICT (sha256)
    DO UPDATE SET
      mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size,
      storage_key = EXCLUDED.storage_key,
      updated_at = NOW()
    RETURNING *
  `;
  return row as ImportedFileCacheRow;
}

export async function markImportedFileCacheFailed(
  cacheId: string,
  errorMessage: string,
): Promise<void> {
  await sql`
    UPDATE app.imported_file_cache
    SET status = 'failed',
        replayable = FALSE,
        error_message = ${errorMessage},
        updated_at = NOW()
    WHERE id = ${cacheId}::uuid
  `;
}

export async function captureImportedPdfCache(params: {
  cacheId: string;
  sourceNoteId: string;
}): Promise<{ replayable: boolean }> {
  const [note] = await sql`
    SELECT content, extracted_text, extraction_coverage
    FROM app.notes
    WHERE note_id = ${params.sourceNoteId}::uuid
    LIMIT 1
  `;

  if (!note) {
    await markImportedFileCacheFailed(
      params.cacheId,
      "Imported file cache source note missing",
    );
    return { replayable: false };
  }

  const markdown = typeof note.content === "string" ? note.content : "";
  const replayable = isReplayableImportedMarkdown(markdown);

  await sql.begin(async (tx: any) => {
    const priorCacheChunks = (await tx`
      SELECT id
      FROM app.imported_file_cache_chunks
      WHERE cache_id = ${params.cacheId}::uuid
    `) as Array<{ id: string }>;
    if (priorCacheChunks.length > 0) {
      await deleteChunkVectors(priorCacheChunks.map((row) => row.id)).catch(
        () => undefined,
      );
    }
    await tx`
      DELETE FROM app.imported_file_cache_chunks
      WHERE cache_id = ${params.cacheId}::uuid
    `;

    const sourceChunks = (await tx`
      SELECT id, text
      FROM app.chunks
      WHERE document_id = ${params.sourceNoteId}::uuid
      ORDER BY created_at ASC, id ASC
    `) as ImportedFileCacheChunkRow[];

    if (sourceChunks.length > 0) {
      const cachedChunkRows = (await tx`
        INSERT INTO app.imported_file_cache_chunks (cache_id, text)
        SELECT * FROM UNNEST(
          ${sourceChunks.map(() => params.cacheId)}::uuid[],
          ${sourceChunks.map((chunk) => chunk.text)}::text[]
        )
        RETURNING id
      `) as Array<{ id: string }>;

      const vectors = await getChunkVectors(sourceChunks.map((chunk) => chunk.id));
      const vectorByChunkId = new Map(
        vectors.map((entry) => [entry.chunkId, entry.vector] as const),
      );
      const points = cachedChunkRows.flatMap((row, index) => {
        const sourceChunk = sourceChunks[index];
        const vector = vectorByChunkId.get(sourceChunk.id);
        if (!vector) return [];
        return [
          {
            chunkId: row.id,
            documentId: params.cacheId,
            userId: CACHE_QDRANT_USER,
            vector,
          },
        ];
      });

      if (points.length > 0) {
        await upsertChunkVectors(points);
      }
    }

    await tx`
      UPDATE app.imported_file_cache
      SET status = 'ready',
          replayable = ${replayable},
          extracted_markdown = ${markdown},
          extracted_text = ${note.extracted_text ?? null},
          extraction_coverage = ${JSON.stringify(note.extraction_coverage ?? null)}::jsonb,
          error_message = NULL,
          updated_at = NOW()
      WHERE id = ${params.cacheId}::uuid
    `;
  });

  return { replayable };
}

export async function cloneImportedPdfCacheToNote(params: {
  cacheId: string;
  noteId: string;
  userId: string;
}): Promise<number> {
  const [cache] = await sql`
    SELECT extracted_markdown, extracted_text, extraction_coverage
    FROM app.imported_file_cache
    WHERE id = ${params.cacheId}::uuid
      AND status = 'ready'
      AND replayable = TRUE
    LIMIT 1
  `;
  if (!cache) return 0;

  const cachedChunks = (await sql`
    SELECT id, text
    FROM app.imported_file_cache_chunks
    WHERE cache_id = ${params.cacheId}::uuid
    ORDER BY created_at ASC, id ASC
  `) as ImportedFileCacheChunkRow[];

  const existingChunks = (await sql`
    SELECT id
    FROM app.chunks
    WHERE document_id = ${params.noteId}::uuid
      AND user_id = ${params.userId}::uuid
  `) as Array<{ id: string }>;
  if (existingChunks.length > 0) {
    await deleteChunkVectors(existingChunks.map((row) => row.id)).catch(
      () => undefined,
    );
    await sql`
      DELETE FROM app.chunks
      WHERE id = ANY(${existingChunks.map((row) => row.id)}::uuid[])
    `;
  }

  await sql`
    UPDATE app.notes
    SET content = ${cache.extracted_markdown ?? ""},
        extracted_text = ${cache.extracted_text ?? null},
        extraction_coverage = ${JSON.stringify(cache.extraction_coverage ?? null)}::jsonb,
        imported_file_cache_id = ${params.cacheId}::uuid,
        updated_at = NOW()
    WHERE note_id = ${params.noteId}::uuid
  `;

  if (cachedChunks.length === 0) return 0;

  const insertedChunks = (await sql`
    INSERT INTO app.chunks (document_id, user_id, text)
    SELECT * FROM UNNEST(
      ${cachedChunks.map(() => params.noteId)}::uuid[],
      ${cachedChunks.map(() => params.userId)}::uuid[],
      ${cachedChunks.map((chunk) => chunk.text)}::text[]
    )
    RETURNING id
  `) as Array<{ id: string }>;

  const vectors = await getChunkVectors(cachedChunks.map((chunk) => chunk.id));
  const vectorByChunkId = new Map(
    vectors.map((entry) => [entry.chunkId, entry.vector] as const),
  );

  const points = insertedChunks.flatMap((row, index) => {
    const cachedChunk = cachedChunks[index];
    const vector = vectorByChunkId.get(cachedChunk.id);
    if (!vector) return [];
    return [
      {
        chunkId: row.id,
        documentId: params.noteId,
        userId: params.userId,
        vector,
      },
    ];
  });

  if (points.length > 0) {
    await upsertChunkVectors(points);
  }

  return insertedChunks.length;
}
