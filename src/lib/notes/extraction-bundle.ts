import { v4 as uuidv4 } from "uuid";
import sql from "@/database/pgsql.js";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

type SqlClient = typeof sql;

interface BundleFolderRow {
  note_id: string;
}

interface SourceTreeRow {
  parent_id: string | null;
  parent_title: string | null;
  parent_is_folder: boolean | null;
}

/**
 * Derive the visible folder name for a source document. The source file and
 * the Markdown extracted from it retain their extensions inside this folder.
 */
export function extractionBundleTitle(filename: string): string {
  const trimmed = filename.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || trimmed || "Extracted document";
}

async function lockUserTree(tx: SqlClient, userId: string): Promise<void> {
  // Use the same user-scoped lock as tree moves. This prevents two extraction
  // workers from creating duplicate bundle folders for the same file.
  await tx`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

async function findBundleFolder(
  tx: SqlClient,
  userId: string,
  parentId: string | null,
  title: string,
): Promise<string | null> {
  const rows = (parentId
    ? await tx`
        SELECT n.note_id
        FROM app.notes n
        JOIN app.tree_items t
          ON t.note_id = n.note_id AND t.user_id = n.user_id
        WHERE n.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = true
          AND n.deleted_at IS NULL
          AND t.parent_id = ${parentId}::uuid
        LIMIT 1
      `
    : await tx`
        SELECT n.note_id
        FROM app.notes n
        JOIN app.tree_items t
          ON t.note_id = n.note_id AND t.user_id = n.user_id
        WHERE n.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = true
          AND n.deleted_at IS NULL
          AND t.parent_id IS NULL
        LIMIT 1
      `) as BundleFolderRow[];

  return rows[0]?.note_id ?? null;
}

async function findOrCreateBundleFolder(
  tx: SqlClient,
  userId: string,
  parentId: string | null,
  title: string,
): Promise<string> {
  const existingId = await findBundleFolder(tx, userId, parentId, title);
  if (existingId) return existingId;

  const bundleId = uuidv4();
  await tx`
    INSERT INTO app.notes (
      note_id, user_id, title, content, is_folder, created_at, updated_at
    ) VALUES (
      ${bundleId}::uuid, ${userId}::uuid, ${title}, '', true, NOW(), NOW()
    )
  `;
  await tx`
    INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (
      ${userId}::uuid, ${bundleId}::uuid, ${parentId ?? null}::uuid
    )
  `;
  return bundleId;
}

async function invalidateBundleTree(
  userId: string,
  parentIds: Array<string | null>,
): Promise<void> {
  const childrenKeys = new Set(
    parentIds.map((parentId) => cacheKeys.treeChildren(userId, parentId)),
  );
  await cacheInvalidate(
    ...childrenKeys,
    cacheKeys.treeFull(userId),
    cacheKeys.notesList(userId, 0, undefined),
  );
}

/**
 * Create or reuse a folder named after a source document under `parentId`.
 * This is used before Canvas cache replay creates both children.
 */
export async function findOrCreateExtractionBundle(
  userId: string,
  parentId: string | null | undefined,
  filename: string,
): Promise<string> {
  const normalizedParentId = parentId ?? null;
  const title = extractionBundleTitle(filename);
  const database = sql as SqlClient & {
    begin: <T>(callback: (tx: SqlClient) => Promise<T>) => Promise<T>;
  };
  const bundleId = await database.begin(async (tx: SqlClient) => {
    await lockUserTree(tx, userId);
    return findOrCreateBundleFolder(tx, userId, normalizedParentId, title);
  });

  await invalidateBundleTree(userId, [normalizedParentId, bundleId]);
  return bundleId;
}

/**
 * Move an already-created source note beneath its document bundle. Standalone
 * uploads reach extraction after their PDF note exists, so this keeps those
 * uploads aligned with Canvas imports without creating a second source note.
 */
export async function moveNoteToExtractionBundle(
  userId: string,
  noteId: string,
  filename: string,
): Promise<string> {
  const title = extractionBundleTitle(filename);
  const database = sql as SqlClient & {
    begin: <T>(callback: (tx: SqlClient) => Promise<T>) => Promise<T>;
  };

  const { bundleId, previousParentId } = await database.begin(async (tx: SqlClient) => {
    await lockUserTree(tx, userId);
    const rows = (await tx`
      SELECT
        t.parent_id,
        parent.title AS parent_title,
        parent.is_folder AS parent_is_folder
      FROM app.tree_items t
      LEFT JOIN app.notes parent
        ON parent.note_id = t.parent_id AND parent.user_id = t.user_id
      WHERE t.user_id = ${userId}::uuid
        AND t.note_id = ${noteId}::uuid
      FOR UPDATE
    `) as SourceTreeRow[];
    const source = rows[0];
    if (!source) {
      throw new Error(`Source note ${noteId} is not present in the user tree`);
    }

    if (
      source.parent_id &&
      source.parent_is_folder === true &&
      source.parent_title === title
    ) {
      return { bundleId: source.parent_id, previousParentId: source.parent_id };
    }

    const bundleId = await findOrCreateBundleFolder(
      tx,
      userId,
      source.parent_id,
      title,
    );
    await tx`
      UPDATE app.tree_items
      SET parent_id = ${bundleId}::uuid, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
    return { bundleId, previousParentId: source.parent_id };
  });

  await invalidateBundleTree(userId, [previousParentId, bundleId]);
  return bundleId;
}
