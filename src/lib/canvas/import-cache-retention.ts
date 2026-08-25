import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { deleteChunkVectors } from "@/lib/qdrant";
import { getStorageProvider } from "@/lib/storage/init";
import {
  isSharedImportedFileAssetKey,
  isSharedImportedFileObjectKey,
  withImportedFileLock,
} from "./import-cache";

const DEFAULT_RETENTION_DAYS = 7;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const DEFAULT_PURGE_BATCH_SIZE = 25;
const STALE_PROCESSING_INTERVAL = "24 hours";

const COLLECTABLE_CACHE_STATUSES = ["ready", "failed"] as const;
const TERMINAL_IMPORT_STATUSES = [
  "complete",
  "forbidden",
  "error",
  "cancelled",
] as const;

interface CacheCandidate {
  id: string;
  sha256: string;
}

interface CacheForPurge extends CacheCandidate {
  storage_key: string;
}

type PurgeOutcome = "purged" | "revived" | "skipped";

export interface ImportedFileCacheRetentionResult {
  retentionDays: number;
  cachesMarkedFailed: number;
  cachesMarkedOrphaned: number;
  cachesRevived: number;
  cachesPurged: number;
  cachesSkipped: number;
  purgeFailures: number;
}

async function markAbandonedProcessingCaches(
  retentionDays: number,
): Promise<number> {
  // A fresh `processing` row may briefly exist before the note/import pointer
  // is written, so normal collection never selects it. After a generous
  // processing lease, an unreferenced row represents an interrupted upload;
  // give it the same retention window from when processing began rather than
  // retaining an abandoned shared PDF forever.
  const rows = await sql`
    UPDATE app.imported_file_cache AS cache
    SET status = 'failed',
        replayable = FALSE,
        error_message = COALESCE(
          cache.error_message,
          'Cache processing abandoned before a reference was attached'
        ),
        orphaned_at = COALESCE(cache.orphaned_at, cache.processing_started_at),
        purge_after = COALESCE(
          cache.purge_after,
          cache.processing_started_at + (${retentionDays} * INTERVAL '1 day')
        ),
        updated_at = NOW()
    WHERE cache.status = 'processing'
      AND cache.processing_started_at < NOW() - ${STALE_PROCESSING_INTERVAL}::interval
      AND NOT EXISTS (
        SELECT 1
        FROM app.notes
        WHERE imported_file_cache_id = cache.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM app.canvas_imports
        WHERE imported_file_cache_id = cache.id
          AND NOT (status = ANY(${TERMINAL_IMPORT_STATUSES}::text[]))
      )
    RETURNING cache.id
  `;
  return rows.length;
}

export function parseImportedFileCacheRetentionDays(
  value: string | undefined,
  fallback = DEFAULT_RETENTION_DAYS,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
}

export function importedFileCacheRetentionDays(): number {
  return parseImportedFileCacheRetentionDays(
    process.env.IMPORT_CACHE_RETENTION_DAYS,
  );
}

async function cacheHasLiveReferences(cacheId: string): Promise<boolean> {
  // Notes remain references while in Trash. A terminal canvas_imports row is
  // audit/history data, not a reason to retain the expensive cache forever.
  const [row] = await sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM app.notes
        WHERE imported_file_cache_id = ${cacheId}::uuid
      )
      OR EXISTS (
        SELECT 1
        FROM app.canvas_imports
        WHERE imported_file_cache_id = ${cacheId}::uuid
          AND NOT (status = ANY(${TERMINAL_IMPORT_STATUSES}::text[]))
      )
    ) AS has_live_references
  `;
  return Boolean(row?.has_live_references);
}

async function clearCacheRetentionSchedule(cacheId: string): Promise<void> {
  await sql`
    UPDATE app.imported_file_cache
    SET orphaned_at = NULL, purge_after = NULL, updated_at = NOW()
    WHERE id = ${cacheId}::uuid
  `;
}

async function reconcileCacheRetention(
  retentionDays: number,
): Promise<{ markedOrphaned: number; revived: number }> {
  const revived = await sql`
    UPDATE app.imported_file_cache AS cache
    SET orphaned_at = NULL, purge_after = NULL, updated_at = NOW()
    WHERE cache.status = ANY(${COLLECTABLE_CACHE_STATUSES}::text[])
      AND (cache.orphaned_at IS NOT NULL OR cache.purge_after IS NOT NULL)
      AND (
        EXISTS (
          SELECT 1
          FROM app.notes
          WHERE imported_file_cache_id = cache.id
        )
        OR EXISTS (
          SELECT 1
          FROM app.canvas_imports
          WHERE imported_file_cache_id = cache.id
            AND NOT (status = ANY(${TERMINAL_IMPORT_STATUSES}::text[]))
        )
      )
    RETURNING cache.id
  `;

  const markedOrphaned = await sql`
    UPDATE app.imported_file_cache AS cache
    SET orphaned_at = COALESCE(cache.orphaned_at, NOW()),
        purge_after = COALESCE(
          cache.purge_after,
          NOW() + (${retentionDays} * INTERVAL '1 day')
        ),
        updated_at = NOW()
    WHERE cache.status = ANY(${COLLECTABLE_CACHE_STATUSES}::text[])
      AND (cache.orphaned_at IS NULL OR cache.purge_after IS NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM app.notes
        WHERE imported_file_cache_id = cache.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM app.canvas_imports
        WHERE imported_file_cache_id = cache.id
          AND NOT (status = ANY(${TERMINAL_IMPORT_STATUSES}::text[]))
      )
    RETURNING cache.id
  `;

  return {
    markedOrphaned: markedOrphaned.length,
    revived: revived.length,
  };
}

async function purgeCacheCandidate(
  candidate: CacheCandidate,
): Promise<PurgeOutcome> {
  return withImportedFileLock(candidate.sha256, async () => {
    // The same SHA lock is taken by all content-addressed import paths. Fetch
    // again after acquiring it: another worker may have revived or removed the
    // row between the daily candidate scan and this attempt.
    const [cache] = (await sql`
      SELECT id, sha256, storage_key
      FROM app.imported_file_cache
      WHERE id = ${candidate.id}::uuid
        AND sha256 = ${candidate.sha256}
        AND status = ANY(${COLLECTABLE_CACHE_STATUSES}::text[])
        AND purge_after IS NOT NULL
        AND purge_after <= NOW()
      LIMIT 1
    `) as CacheForPurge[];
    if (!cache) return "skipped";

    if (await cacheHasLiveReferences(cache.id)) {
      await clearCacheRetentionSchedule(cache.id);
      return "revived";
    }

    if (!isSharedImportedFileObjectKey(cache.storage_key)) {
      throw new Error(
        `Refusing to purge cache ${cache.id}: unexpected shared object key`,
      );
    }

    const chunkRows = (await sql`
      SELECT id
      FROM app.imported_file_cache_chunks
      WHERE cache_id = ${cache.id}::uuid
    `) as Array<{ id: string }>;
    const assetRows = (await sql`
      SELECT storage_key
      FROM app.imported_file_cache_assets
      WHERE cache_id = ${cache.id}::uuid
    `) as Array<{ storage_key: string }>;

    for (const asset of assetRows) {
      if (!isSharedImportedFileAssetKey(asset.storage_key, cache.id)) {
        throw new Error(
          `Refusing to purge cache ${cache.id}: unexpected shared asset key`,
        );
      }
    }

    // Check again immediately before deleting external state. This catches a
    // reference that appeared while the cache metadata was being read, while
    // keeping the destructive work and final database delete contiguous.
    if (await cacheHasLiveReferences(cache.id)) {
      await clearCacheRetentionSchedule(cache.id);
      return "revived";
    }

    // Delete external representations before the database row. If either
    // backend fails, the row (and therefore IDs/object keys) remains for a
    // future idempotent retry.
    await deleteChunkVectors(chunkRows.map((row) => row.id));

    const [otherCache] = await sql`
      SELECT id
      FROM app.imported_file_cache
      WHERE storage_key = ${cache.storage_key}
        AND id <> ${cache.id}::uuid
      LIMIT 1
    `;

    const storage = getStorageProvider();
    for (const asset of assetRows) {
      await storage.deleteObject(asset.storage_key);
    }
    // `storage_key` is content-addressed, so distinct pipeline versions can
    // point to the same immutable PDF. Only the final cache row owns its
    // deletion.
    if (!otherCache) {
      await storage.deleteObject(cache.storage_key);
    }

    const deleted = await sql`
      DELETE FROM app.imported_file_cache
      WHERE id = ${cache.id}::uuid
      RETURNING id
    `;
    if (deleted.length === 0) return "skipped";
    return "purged";
  });
}

export async function runImportedFileCacheRetention(
  options: { retentionDays?: number; batchSize?: number } = {},
): Promise<ImportedFileCacheRetentionResult> {
  const retentionDays = options.retentionDays == null
    ? importedFileCacheRetentionDays()
    : parseImportedFileCacheRetentionDays(String(options.retentionDays));
  const requestedBatchSize = options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE;
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.max(
        1,
        Math.min(DEFAULT_PURGE_BATCH_SIZE, Math.floor(requestedBatchSize)),
      )
    : DEFAULT_PURGE_BATCH_SIZE;
  const cachesMarkedFailed = await markAbandonedProcessingCaches(retentionDays);
  const reconciled = await reconcileCacheRetention(retentionDays);
  const candidates = (await sql`
    SELECT id, sha256
    FROM app.imported_file_cache
    WHERE status = ANY(${COLLECTABLE_CACHE_STATUSES}::text[])
      AND purge_after IS NOT NULL
      AND purge_after <= NOW()
    ORDER BY purge_after ASC, id ASC
    LIMIT ${batchSize}
  `) as CacheCandidate[];

  const result: ImportedFileCacheRetentionResult = {
    retentionDays,
    cachesMarkedFailed,
    cachesMarkedOrphaned: reconciled.markedOrphaned,
    cachesRevived: reconciled.revived,
    cachesPurged: 0,
    cachesSkipped: 0,
    purgeFailures: 0,
  };

  // Process sequentially: the deletion is intentionally conservative and may
  // hold one SHA advisory lock while object storage is contacted.
  for (const candidate of candidates) {
    try {
      const outcome = await purgeCacheCandidate(candidate);
      if (outcome === "purged") result.cachesPurged += 1;
      else if (outcome === "revived") result.cachesRevived += 1;
      else result.cachesSkipped += 1;
    } catch (error) {
      result.purgeFailures += 1;
      logger.warn("imported file cache retention purge failed", {
        cacheId: candidate.id,
        error,
      });
    }
  }

  return result;
}
