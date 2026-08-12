import type postgres from "postgres";
import sql from "@/database/pgsql";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";
import { isSharedImportedFileKey } from "@/lib/canvas/import-cache";
import logger from "@/lib/logger";
import {
  markerAssetKey,
  markerAssetPrefix,
  markerMetadataKey,
  sanitizeMarkerAssetName,
} from "@/lib/marker-output";
import { deleteChunkVectors, setChunkVectorsSearchable } from "@/lib/qdrant";
import { getStorageProvider } from "@/lib/storage/init";

const DEFAULT_TRASH_RETENTION_DAYS = 30;
const MAX_TRASH_RETENTION_DAYS = 365;
const DEFAULT_RETENTION_BATCH_SIZE = 50;
const MAX_RETENTION_BATCH_SIZE = 250;
const MARKER_ASSET_RE = /\/api\/notes\/([0-9a-f-]{36})\/assets\?name=([^\s)]+)/gi;

type TransactionSql = postgres.TransactionSql;

/** Compatibility result for callers that use the pre-bundle Trash API. */
export interface NoteTreeLocation {
  parentId: string | null;
  previousParentId: string | null;
  affectedFolderIds: string[];
  affectedNoteIds: string[];
}

interface DeletedNoteRow {
  note_id: string;
  is_folder: boolean;
}

interface RootLocationRow {
  note_id: string;
  parent_id: string | null;
}

function folderIds(rows: readonly DeletedNoteRow[]): string[] {
  return rows.filter((row) => row.is_folder).map((row) => row.note_id);
}

function noteIds(rows: readonly DeletedNoteRow[]): string[] {
  return rows.map((row) => row.note_id);
}

interface NoteTreeRow {
  note_id: string;
  title: string;
  is_folder: boolean;
  parent_id: string | null;
}

interface TrashRootRow {
  note_id: string;
  title: string;
  is_folder: boolean;
  deleted_at: Date | string;
  trash_expires_at: Date | string;
  item_count: number | string;
  original_path: string[] | null;
}

interface CleanupTaskRow {
  id: string;
  user_id: string;
  note_ids: string[] | null;
  chunk_ids: string[] | null;
  object_keys: string[] | null;
  object_prefixes: string[] | null;
}

export interface TrashRoot {
  id: string;
  title: string;
  isFolder: boolean;
  deletedAt: string;
  purgeAt: string;
  originalPath: string[];
  descendantCount: number;
}

export interface TrashTransitionResult {
  rootId: string;
  noteIds: string[];
  purgeAt: string;
}

export interface PermanentDeleteResult {
  noteIds: string[];
  cleanupTaskId: string | null;
  objectKeys: number;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function trashRetentionDays(): number {
  return boundedInteger(
    process.env.TRASH_RETENTION_DAYS,
    DEFAULT_TRASH_RETENTION_DAYS,
    1,
    MAX_TRASH_RETENTION_DAYS,
  );
}

function retentionBatchSize(): number {
  return boundedInteger(
    process.env.RETENTION_CLEANUP_BATCH_SIZE,
    DEFAULT_RETENTION_BATCH_SIZE,
    1,
    MAX_RETENTION_BATCH_SIZE,
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isSafeCleanupPrefix(userId: string, prefix: string): boolean {
  return (
    prefix === `marker/${userId}/` ||
    prefix === `vault/${userId}/` ||
    prefix === `vault-uploads/${userId}/`
  );
}

function asIsoDate(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value ?? "");
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

async function lockUserTree(tx: TransactionSql, userId: string): Promise<void> {
  await tx`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

async function selectActiveSubtree(
  tx: TransactionSql,
  userId: string,
  rootNoteId: string,
): Promise<NoteTreeRow[]> {
  return (await tx`
    WITH RECURSIVE subtree(note_id) AS (
      SELECT n.note_id
      FROM app.notes n
      WHERE n.note_id = ${rootNoteId}::uuid
        AND n.user_id = ${userId}::uuid
        AND n.deleted_at IS NULL

      UNION

      SELECT child.note_id
      FROM app.tree_items child_tree
      JOIN subtree parent ON parent.note_id = child_tree.parent_id
      JOIN app.notes child ON child.note_id = child_tree.note_id
      WHERE child_tree.user_id = ${userId}::uuid
        AND child.user_id = ${userId}::uuid
        AND child.deleted_at IS NULL
    )
    SELECT n.note_id, n.title, n.is_folder, tree.parent_id
    FROM app.notes n
    LEFT JOIN app.tree_items tree
      ON tree.note_id = n.note_id AND tree.user_id = ${userId}::uuid
    WHERE n.note_id IN (SELECT note_id FROM subtree)
      AND n.user_id = ${userId}::uuid
    FOR UPDATE OF n
  `) as NoteTreeRow[];
}

async function cancelNoteProcessing(
  tx: TransactionSql,
  userId: string,
  noteIds: string[],
  reason: string,
): Promise<void> {
  if (noteIds.length === 0) return;

  // Marker completion and Canvas retry paths use these state transitions as
  // their compare-and-swap fence. Work already on a GPU cannot be unsent, but
  // it can no longer publish a result for a trashed note.
  await tx`
    UPDATE app.marker_jobs
    SET status = 'cancelled', error = ${reason}, completed_at = NOW(), updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${noteIds}::uuid[])
      AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
  `;

  await tx`
    UPDATE app.canvas_imports
    SET status = 'cancelled', error_message = ${reason}, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND (
        note_id = ANY(${noteIds}::uuid[])
        OR parent_folder_id = ANY(${noteIds}::uuid[])
        -- Legacy import rows can predate parent_folder_id. For an actual
        -- Canvas course root, use its stable course identity as the fence so
        -- a late worker cannot recreate files at the workspace root.
        OR canvas_course_id IN (
          SELECT canvas_course_id
          FROM app.notes
          WHERE user_id = ${userId}::uuid
            AND note_id = ANY(${noteIds}::uuid[])
            AND is_folder = TRUE
            AND canvas_course_id IS NOT NULL
            AND canvas_module_id IS NULL
            AND canvas_assignment_id IS NULL
        )
      )
      AND status IN (
        'pending', 'downloading', 'processing', 'indexing', 'pending_retry',
        'pending_marker'
      )
  `;

  await tx`
    UPDATE app.ingestion_jobs
    SET status = 'cancelled', error = ${reason}, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${noteIds}::uuid[])
      AND status NOT IN ('done', 'failed', 'cancelled')
  `;
}

async function invalidateLifecycleCaches(
  userId: string,
  noteIds: string[],
  parentIds: Array<string | null | undefined> = [],
): Promise<void> {
  const keys = new Set<string>([
    cacheKeys.treeFull(userId),
    cacheKeys.notesList(userId, 0, undefined),
  ]);

  for (const noteId of noteIds) {
    keys.add(cacheKeys.note(userId, noteId));
    keys.add(cacheKeys.treeChildren(userId, noteId));
  }
  for (const parentId of parentIds) {
    keys.add(cacheKeys.treeChildren(userId, parentId ?? null));
  }

  await cacheInvalidate(...keys);
}

async function updateVectorVisibility(
  noteIds: string[],
  searchable: boolean,
): Promise<void> {
  if (noteIds.length === 0) return;

  const chunks = (await sql`
    SELECT id
    FROM app.chunks
    WHERE document_id = ANY(${noteIds}::uuid[])
  `) as Array<{ id: string }>;
  const chunkIds = chunks.map((row) => row.id);
  if (chunkIds.length === 0) return;

  await setChunkVectorsSearchable(chunkIds, searchable).catch((error) => {
    // SQL visibility remains authoritative. A retryable Qdrant issue may
    // temporarily reduce recall, never expose trashed content.
    logger.warn("note Trash vector visibility update failed", {
      searchable,
      noteCount: noteIds.length,
      chunkCount: chunkIds.length,
      error,
    });
  });
}

/** Move a note or folder and every active descendant into one Trash bundle. */
export async function moveSubtreeToTrash(
  userId: string,
  rootNoteId: string,
): Promise<TrashTransitionResult | null> {
  const result = await sql.begin(async (tx: TransactionSql) => {
    await lockUserTree(tx, userId);
    const rows = await selectActiveSubtree(tx, userId, rootNoteId);
    const root = rows.find(
      (row) => String(row.note_id).toLowerCase() === rootNoteId.toLowerCase(),
    );
    if (!root) return null;

    const noteIds = rows.map((row) => String(row.note_id));
    const retentionDays = trashRetentionDays();
    const [updated] = await tx`
      UPDATE app.notes
      SET deleted_at = NOW(),
          trash_root_id = ${rootNoteId}::uuid,
          trash_expires_at = NOW() + (${retentionDays}::int * INTERVAL '1 day'),
          updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
        AND deleted_at IS NULL
      RETURNING trash_expires_at
    `;

    await cancelNoteProcessing(
      tx,
      userId,
      noteIds,
      "Note moved to Trash before processing completed",
    );

    return {
      rootId: rootNoteId,
      noteIds,
      parentIds: [root.parent_id],
      purgeAt: asIsoDate(updated?.trash_expires_at),
    };
  });

  if (!result) return null;
  await invalidateLifecycleCaches(userId, result.noteIds, result.parentIds);
  await updateVectorVisibility(result.noteIds, false);

  return {
    rootId: result.rootId,
    noteIds: result.noteIds,
    purgeAt: result.purgeAt,
  };
}

/** Restore a complete Trash bundle. Individual descendants are never restored alone. */
export async function restoreTrashRoot(
  userId: string,
  rootNoteId: string,
): Promise<TrashTransitionResult | null> {
  const result = await sql.begin(async (tx: TransactionSql) => {
    await lockUserTree(tx, userId);
    const rows = (await tx`
      SELECT n.note_id, n.title, n.is_folder, tree.parent_id
      FROM app.notes n
      LEFT JOIN app.tree_items tree
        ON tree.note_id = n.note_id AND tree.user_id = ${userId}::uuid
      WHERE n.user_id = ${userId}::uuid
        AND n.deleted_at IS NOT NULL
        AND n.trash_root_id = ${rootNoteId}::uuid
      FOR UPDATE OF n
    `) as NoteTreeRow[];

    const root = rows.find(
      (row) => String(row.note_id).toLowerCase() === rootNoteId.toLowerCase(),
    );
    if (!root) return null;
    const noteIds = rows.map((row) => String(row.note_id));

    await tx`
      UPDATE app.notes
      SET deleted_at = NULL,
          trash_root_id = NULL,
          trash_expires_at = NULL,
          updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
        AND trash_root_id = ${rootNoteId}::uuid
    `;

    // Legacy deletion used to remove tree rows. Ensure a restored root is
    // always visible even if its old parent was permanently purged earlier.
    await tx`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      SELECT ${userId}::uuid, ${rootNoteId}::uuid, NULL
      WHERE NOT EXISTS (
        SELECT 1
        FROM app.tree_items
        WHERE user_id = ${userId}::uuid
          AND note_id = ${rootNoteId}::uuid
      )
    `;

    // Tree rows deliberately retain their original parent. The active-tree
    // reader renders a temporarily unavailable parent at the workspace root,
    // but does not rewrite this relationship; if that parent is restored
    // later, this bundle returns to its original location automatically.

    return {
      rootId: rootNoteId,
      noteIds,
      parentIds: [root.parent_id],
    };
  });

  if (!result) return null;
  await invalidateLifecycleCaches(userId, result.noteIds, result.parentIds);
  await updateVectorVisibility(result.noteIds, true);

  return {
    rootId: result.rootId,
    noteIds: result.noteIds,
    purgeAt: new Date().toISOString(),
  };
}

function markerObjectKeys(
  userId: string,
  noteRows: Array<{ note_id: string; content: string | null }>,
): string[] {
  const keys = new Set<string>();
  for (const row of noteRows) {
    const noteId = String(row.note_id);
    keys.add(markerMetadataKey(userId, noteId));
    for (const match of String(row.content ?? "").matchAll(MARKER_ASSET_RE)) {
      if (String(match[1]).toLowerCase() !== noteId.toLowerCase()) continue;
      let decodedName: string;
      try {
        decodedName = decodeURIComponent(match[2]);
      } catch {
        // Notes are user-editable. A malformed URL-like string must not make
        // a permanent-delete transaction fail or broaden the storage key.
        continue;
      }
      const name = sanitizeMarkerAssetName(decodedName);
      if (name) keys.add(markerAssetKey(userId, noteId, name));
    }
  }
  return [...keys];
}

async function removeNoteRowsPermanently(
  tx: TransactionSql,
  userId: string,
  noteIds: string[],
): Promise<{ cleanupTaskId: string | null; objectKeys: number }> {
  if (noteIds.length === 0) return { cleanupTaskId: null, objectKeys: 0 };

  const noteRows = (await tx`
    SELECT note_id, s3_key, content
    FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${noteIds}::uuid[])
    FOR UPDATE
  `) as Array<{ note_id: string; s3_key: string | null; content: string | null }>;
  const ownedIds = noteRows.map((row) => String(row.note_id));
  if (ownedIds.length === 0) return { cleanupTaskId: null, objectKeys: 0 };

  const [attachmentRows, markerRows, chunkRows] = await Promise.all([
    tx<Array<{ s3_key: string | null }>>`
      SELECT s3_key
      FROM app.attachments
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${ownedIds}::uuid[])
    `,
    tx<Array<{ result_key: string | null }>>`
      SELECT result_key
      FROM app.marker_jobs
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${ownedIds}::uuid[])
    `,
    tx<Array<{ id: string }>>`
      SELECT id
      FROM app.chunks
      WHERE user_id = ${userId}::uuid
        AND document_id = ANY(${ownedIds}::uuid[])
    `,
  ]);

  const objectKeys = uniqueStrings([
    ...noteRows.map((row) => row.s3_key),
    ...attachmentRows.map((row) => row.s3_key),
    ...markerRows.map((row) => row.result_key),
    ...markerObjectKeys(userId, noteRows),
  ]).filter((key) => !isSharedImportedFileKey(key));
  const chunkIds = uniqueStrings(
    chunkRows.map((row) => row.id),
  );

  await cancelNoteProcessing(
    tx,
    userId,
    ownedIds,
    "Note permanently deleted before processing completed",
  );

  const [cleanupTask] = await tx`
    INSERT INTO app.note_deletion_cleanup_tasks
      (user_id, note_ids, chunk_ids, object_keys)
    VALUES (
      ${userId}::uuid,
      ${ownedIds}::uuid[],
      ${chunkIds}::uuid[],
      ${objectKeys}::text[]
    )
    RETURNING id
  `;

  await tx`
    DELETE FROM app.chat_messages
    WHERE session_id IN (
      SELECT id
      FROM app.chat_sessions
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${ownedIds}::uuid[])
    )
  `;
  await tx`
    DELETE FROM app.chat_sessions
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;

  await tx`
    DELETE FROM app.quiz_sessions qs
    WHERE qs.user_id = ${userId}::uuid
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(qs.card_ids) AS session_card(card_id)
        JOIN app.quiz_cards qc ON qc.id = session_card.card_id::uuid
        JOIN app.quiz_questions qq ON qq.id = qc.question_id
        WHERE qc.user_id = ${userId}::uuid
          AND qq.user_id = ${userId}::uuid
          AND qq.note_id = ANY(${ownedIds}::uuid[])
      )
  `;
  await tx`
    DELETE FROM app.quiz_reviews
    WHERE user_id = ${userId}::uuid
      AND question_id IN (
        SELECT id
        FROM app.quiz_questions
        WHERE user_id = ${userId}::uuid
          AND note_id = ANY(${ownedIds}::uuid[])
      )
  `;
  await tx`
    DELETE FROM app.quiz_cards
    WHERE user_id = ${userId}::uuid
      AND question_id IN (
        SELECT id
        FROM app.quiz_questions
        WHERE user_id = ${userId}::uuid
          AND note_id = ANY(${ownedIds}::uuid[])
      )
  `;
  await tx`
    DELETE FROM app.quiz_questions
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;

  const [embeddingsTable] = await tx`
    SELECT to_regclass('app.embeddings') AS table_name
  `;
  if (embeddingsTable?.table_name && chunkIds.length > 0) {
    await tx`
      DELETE FROM app.embeddings
      WHERE chunk_id = ANY(${chunkIds}::uuid[])
    `;
  }

  await tx`
    DELETE FROM app.chunks
    WHERE user_id = ${userId}::uuid
      AND document_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.pdf_annotations
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.attachments
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.ingestion_jobs
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.canvas_imports
    WHERE user_id = ${userId}::uuid
      AND (
        note_id = ANY(${ownedIds}::uuid[])
        OR parent_folder_id = ANY(${ownedIds}::uuid[])
      )
  `;
  await tx`
    DELETE FROM app.marker_jobs
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;
  // A separately trashed child can still point at this bundle's parent. Make
  // it a root before deleting that parent so the parent_id FK cannot cascade
  // away its sole tree row and make a later restore invisible.
  await tx`
    UPDATE app.tree_items
    SET parent_id = NULL, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND parent_id = ANY(${ownedIds}::uuid[])
      AND NOT note_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.tree_items
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;
  await tx`
    DELETE FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND note_id = ANY(${ownedIds}::uuid[])
  `;

  return {
    cleanupTaskId: cleanupTask?.id ?? null,
    objectKeys: objectKeys.length,
  };
}

/** Permanently delete an already-resolved group of user-owned note rows. */
export async function permanentlyDeleteNotes(
  userId: string,
  noteIds: string[],
): Promise<PermanentDeleteResult> {
  const requestedIds = uniqueStrings(noteIds);
  if (requestedIds.length === 0) {
    return { noteIds: [], cleanupTaskId: null, objectKeys: 0 };
  }

  const result = await sql.begin(async (tx: TransactionSql) => {
    await lockUserTree(tx, userId);
    const ownedRows = (await tx`
      SELECT note_id
      FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${requestedIds}::uuid[])
      FOR UPDATE
    `) as Array<{ note_id: string }>;
    const ownedIds = ownedRows.map((row) => String(row.note_id));
    const removal = await removeNoteRowsPermanently(tx, userId, ownedIds);
    return {
      noteIds: ownedIds,
      cleanupTaskId: removal.cleanupTaskId,
      objectKeys: removal.objectKeys,
    };
  });

  await invalidateLifecycleCaches(userId, result.noteIds);
  if (result.cleanupTaskId) {
    await processNoteDeletionCleanupTask(result.cleanupTaskId);
  }
  return result;
}

/**
 * Clear every note for one user under the same tree lock used by Trash.
 * This is intentionally distinct from accepting a caller-supplied ID list:
 * Clear Vault must see notes created by a worker that was already in flight
 * when cancellation began, rather than selecting an ID snapshot beforehand.
 */
export async function permanentlyDeleteAllUserNotes(
  userId: string,
): Promise<PermanentDeleteResult> {
  const result = await sql.begin(async (tx: TransactionSql) => {
    await lockUserTree(tx, userId);
    const ownedRows = (await tx`
      SELECT note_id
      FROM app.notes
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `) as Array<{ note_id: string }>;
    const ownedIds = ownedRows.map((row) => String(row.note_id));
    const removal = await removeNoteRowsPermanently(tx, userId, ownedIds);
    return {
      noteIds: ownedIds,
      cleanupTaskId: removal.cleanupTaskId,
      objectKeys: removal.objectKeys,
    };
  });

  await invalidateLifecycleCaches(userId, result.noteIds);
  if (result.cleanupTaskId) {
    await processNoteDeletionCleanupTask(result.cleanupTaskId);
  }
  return result;
}

/** Permanently delete exactly one Trash bundle, addressed by its root note. */
export async function permanentlyDeleteTrashRoot(
  userId: string,
  rootNoteId: string,
): Promise<PermanentDeleteResult | null> {
  const result = await sql.begin(async (tx: TransactionSql) => {
    await lockUserTree(tx, userId);
    const rows = (await tx`
      SELECT note_id
      FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND deleted_at IS NOT NULL
        AND trash_root_id = ${rootNoteId}::uuid
      FOR UPDATE
    `) as Array<{ note_id: string }>;
    const noteIds = rows.map((row) => String(row.note_id));
    if (!noteIds.some((noteId) => noteId.toLowerCase() === rootNoteId.toLowerCase())) {
      return null;
    }
    const removal = await removeNoteRowsPermanently(tx, userId, noteIds);
    return {
      noteIds,
      cleanupTaskId: removal.cleanupTaskId,
      objectKeys: removal.objectKeys,
    };
  });

  if (!result) return null;
  await invalidateLifecycleCaches(userId, result.noteIds);
  if (result.cleanupTaskId) {
    await processNoteDeletionCleanupTask(result.cleanupTaskId);
  }
  return result;
}

export async function listTrashRoots(userId: string): Promise<TrashRoot[]> {
  const rows = (await sql`
    WITH RECURSIVE roots AS (
      SELECT n.note_id, n.title, n.is_folder, n.deleted_at, n.trash_expires_at,
             COUNT(bundle.note_id)::int AS item_count
      FROM app.notes n
      LEFT JOIN app.notes bundle
        ON bundle.user_id = n.user_id
        AND bundle.deleted_at IS NOT NULL
        AND bundle.trash_root_id = n.note_id
      WHERE n.user_id = ${userId}::uuid
        AND n.deleted_at IS NOT NULL
        AND n.trash_root_id = n.note_id
      GROUP BY n.note_id, n.title, n.is_folder, n.deleted_at, n.trash_expires_at
    ),
    ancestry AS (
      SELECT roots.note_id AS root_id,
             root_tree.parent_id,
             ARRAY[roots.title]::text[] AS path,
             ARRAY[roots.note_id]::uuid[] AS visited
      FROM roots
      LEFT JOIN app.tree_items root_tree
        ON root_tree.note_id = roots.note_id
        AND root_tree.user_id = ${userId}::uuid

      UNION ALL

      SELECT ancestry.root_id,
             parent_tree.parent_id,
             ARRAY[parent_note.title]::text[] || ancestry.path,
             ancestry.visited || parent_note.note_id
      FROM ancestry
      JOIN app.tree_items parent_tree
        ON parent_tree.note_id = ancestry.parent_id
        AND parent_tree.user_id = ${userId}::uuid
      JOIN app.notes parent_note
        ON parent_note.note_id = parent_tree.note_id
        AND parent_note.user_id = ${userId}::uuid
      WHERE NOT parent_note.note_id = ANY(ancestry.visited)
    )
    SELECT roots.*,
      (
        SELECT path
        FROM ancestry
        WHERE ancestry.root_id = roots.note_id
        ORDER BY cardinality(path) DESC
        LIMIT 1
      ) AS original_path
    FROM roots
    ORDER BY roots.deleted_at DESC
  `) as TrashRootRow[];

  return rows.map((row) => {
    const path = Array.isArray(row.original_path) ? row.original_path : [row.title];
    const itemCount = Number(row.item_count) || 1;
    return {
      id: String(row.note_id),
      title: row.title,
      isFolder: Boolean(row.is_folder),
      deletedAt: asIsoDate(row.deleted_at),
      purgeAt: asIsoDate(row.trash_expires_at),
      originalPath: path.slice(0, -1),
      descendantCount: Math.max(0, itemCount - 1),
    };
  });
}

export async function emptyTrash(userId: string): Promise<number> {
  const roots = (await sql`
    SELECT note_id
    FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NOT NULL
      AND trash_root_id = note_id
    ORDER BY deleted_at ASC
  `) as Array<{ note_id: string }>;

  let deleted = 0;
  for (const root of roots) {
    const result = await permanentlyDeleteTrashRoot(userId, String(root.note_id));
    if (result) deleted += 1;
  }
  return deleted;
}

/** Worker entry point: finalise complete Trash bundles whose 30-day window elapsed. */
export async function purgeExpiredTrash(): Promise<number> {
  const limit = retentionBatchSize();
  const rows = (await sql`
    SELECT note_id, user_id
    FROM app.notes
    WHERE deleted_at IS NOT NULL
      AND trash_root_id = note_id
      AND trash_expires_at <= NOW()
    ORDER BY trash_expires_at ASC
    LIMIT ${limit}
  `) as Array<{ note_id: string; user_id: string }>;

  let purged = 0;
  for (const row of rows) {
    try {
      const result = await permanentlyDeleteTrashRoot(
        String(row.user_id),
        String(row.note_id),
      );
      if (result) purged += 1;
    } catch (error) {
      logger.error("expired Trash purge failed", {
        userId: row.user_id,
        rootNoteId: row.note_id,
        error,
      });
    }
  }
  return purged;
}

/**
 * Repair visibility after a worker that had already started indexing races a
 * Trash transition. SQL remains the access-control boundary; this keeps
 * retained vectors from degrading semantic-search recall until their bundle
 * is restored or permanently purged.
 */
export async function reconcileTrashedVectorVisibility(): Promise<number> {
  const rows = (await sql`
    SELECT c.id
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE n.deleted_at IS NOT NULL
    ORDER BY c.created_at ASC
    LIMIT ${retentionBatchSize() * 20}
  `) as Array<{ id: string }>;
  const chunkIds = uniqueStrings(rows.map((row) => row.id));
  if (chunkIds.length === 0) return 0;

  await setChunkVectorsSearchable(chunkIds, false);
  return chunkIds.length;
}

async function processNoteDeletionCleanupTask(taskId: string): Promise<boolean> {
  // Keep the row lock until both idempotent external deletes and the durable
  // completion marker are done. Without the transaction, `FOR UPDATE` is
  // released immediately and two worker replicas can process the same task.
  return sql.begin(async (tx: TransactionSql) => {
    const [task] = (await tx`
      SELECT id, user_id, note_ids, chunk_ids, object_keys, object_prefixes
      FROM app.note_deletion_cleanup_tasks
      WHERE id = ${taskId}::uuid
        AND completed_at IS NULL
      FOR UPDATE SKIP LOCKED
    `) as CleanupTaskRow[];
    if (!task) return true;

    try {
      const chunkIds = uniqueStrings(task.chunk_ids ?? []);
      if (chunkIds.length > 0) await deleteChunkVectors(chunkIds);

      const storage = getStorageProvider();
      const objectKeys = uniqueStrings(task.object_keys ?? [])
        .filter((key) => !isSharedImportedFileKey(key));
      for (const key of objectKeys) {
        await storage.deleteObject(key);
      }
      for (const prefix of uniqueStrings(task.object_prefixes ?? [])) {
        if (!isSafeCleanupPrefix(task.user_id, prefix)) {
          throw new Error("Refusing to delete an unsafe lifecycle storage prefix");
        }
        await storage.deletePrefix(prefix);
      }
      // Marker image keys are intentionally untracked because markdown is
      // user-editable. Delete the exact note namespace as a separate durable,
      // retryable operation instead of guessing from the remaining content.
      for (const noteId of uniqueStrings(task.note_ids ?? [])) {
        await storage.deletePrefix(markerAssetPrefix(task.user_id, noteId));
      }

      // Do not keep a completed deletion journal indefinitely: it contains
      // note/object identifiers solely so failed external deletion can retry.
      await tx`
        DELETE FROM app.note_deletion_cleanup_tasks
        WHERE id = ${task.id}::uuid
      `;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await tx`
          UPDATE app.note_deletion_cleanup_tasks
          SET attempts = attempts + 1,
              last_error = ${message.slice(0, 4000)},
              updated_at = NOW()
          WHERE id = ${task.id}::uuid
        `;
      } catch (updateError: unknown) {
        logger.error("note deletion cleanup error state update failed", {
          taskId,
          error: updateError,
        });
      }
      logger.warn("note deletion cleanup deferred for retry", { taskId, error });
      return false;
    }
  });
}

/**
 * Clear Vault also owns raw zip uploads and intermediate Vault objects that
 * may not have reached a note row when cancellation occurred. Persist their
 * user-scoped prefix cleanup in the same retry journal as note deletion.
 */
export async function queueVaultStorageCleanup(userId: string): Promise<boolean> {
  const prefixes = [`vault/${userId}/`, `vault-uploads/${userId}/`];
  const [task] = await sql`
    INSERT INTO app.note_deletion_cleanup_tasks
      (user_id, object_prefixes)
    VALUES (${userId}::uuid, ${prefixes}::text[])
    RETURNING id
  `;
  if (!task?.id) return false;
  return !(await processNoteDeletionCleanupTask(String(task.id)));
}

/** Worker entry point: retry external cleanup left by permanent deletion. */
export async function processPendingNoteDeletionCleanup(): Promise<number> {
  const rows = (await sql`
    SELECT id
    FROM app.note_deletion_cleanup_tasks
    WHERE completed_at IS NULL
    ORDER BY created_at ASC
    LIMIT ${retentionBatchSize()}
  `) as Array<{ id: string }>;

  let completed = 0;
  for (const row of rows) {
    if (await processNoteDeletionCleanupTask(String(row.id))) completed += 1;
  }
  return completed;
}

/**
 * Legacy single-note Trash API retained for integrations that have not yet
 * moved to the richer bundle endpoints. New UI routes use moveSubtreeToTrash.
 */
export async function softDeleteNote(
  userId: string,
  noteId: string,
): Promise<NoteTreeLocation | null> {
  const database = sql as postgres.Sql;
  return database.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
    `;
    const deleted = await tx<DeletedNoteRow[]>`
      WITH RECURSIVE subtree(note_id) AS (
        SELECT ${noteId}::uuid
        UNION
        SELECT child.note_id
        FROM app.tree_items child
        JOIN subtree parent ON child.parent_id = parent.note_id
        WHERE child.user_id = ${userId}::uuid
      )
      UPDATE app.notes note
      SET deleted_at = NOW()
      WHERE note.user_id = ${userId}::uuid
        AND note.note_id IN (SELECT note_id FROM subtree)
        AND note.deleted_at IS NULL
      RETURNING note.note_id, note.is_folder
    `;
    if (!deleted.some((row) => row.note_id === noteId)) return null;

    const locations = await tx<Array<{ parent_id: string | null }>>`
      SELECT parent_id
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      LIMIT 1
    `;
    const parentId = locations[0]?.parent_id ?? null;
    return {
      parentId,
      previousParentId: parentId,
      affectedFolderIds: folderIds(deleted),
      affectedNoteIds: noteIds(deleted),
    };
  });
}

/** See softDeleteNote; retained for older consumers during the bundle rollout. */
export async function restoreNote(
  userId: string,
  noteId: string,
): Promise<NoteTreeLocation | null> {
  const database = sql as postgres.Sql;
  return database.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
    `;
    const roots = await tx<RootLocationRow[]>`
      SELECT note.note_id, tree.parent_id
      FROM app.notes note
      LEFT JOIN app.tree_items tree
        ON tree.note_id = note.note_id
       AND tree.user_id = ${userId}::uuid
      WHERE note.note_id = ${noteId}::uuid
        AND note.user_id = ${userId}::uuid
        AND note.deleted_at IS NOT NULL
      FOR UPDATE OF note
    `;
    const root = roots[0];
    if (!root) return null;

    let parentId: string | null = null;
    if (root.parent_id) {
      const parents = await tx<Array<{ note_id: string }>>`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${root.parent_id}::uuid
          AND user_id = ${userId}::uuid
          AND is_folder = TRUE
          AND deleted_at IS NULL
        FOR SHARE
      `;
      if (parents.length > 0) parentId = root.parent_id;
    }

    const restored = await tx<DeletedNoteRow[]>`
      WITH RECURSIVE subtree(note_id) AS (
        SELECT ${noteId}::uuid
        UNION
        SELECT child.note_id
        FROM app.tree_items child
        JOIN subtree parent ON child.parent_id = parent.note_id
        WHERE child.user_id = ${userId}::uuid
      ),
      cohort AS MATERIALIZED (
        SELECT root.deleted_at
        FROM app.notes root
        WHERE root.note_id = ${noteId}::uuid
          AND root.user_id = ${userId}::uuid
          AND root.deleted_at IS NOT NULL
      )
      UPDATE app.notes note
      SET deleted_at = NULL, updated_at = NOW()
      FROM cohort
      WHERE note.user_id = ${userId}::uuid
        AND note.note_id IN (SELECT note_id FROM subtree)
        AND note.deleted_at = cohort.deleted_at
      RETURNING note.note_id, note.is_folder
    `;
    if (!restored.some((row) => row.note_id === noteId)) return null;

    await tx`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId}::uuid)
      ON CONFLICT (user_id, note_id) DO UPDATE
      SET parent_id = EXCLUDED.parent_id,
          updated_at = NOW()
    `;

    return {
      parentId,
      previousParentId: root.parent_id ?? null,
      affectedFolderIds: folderIds(restored),
      affectedNoteIds: noteIds(restored),
    };
  });
}
