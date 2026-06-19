/**
 * Vault tree builder — maps between zip paths and note tree hierarchy.
 * Shared by import-worker and export-worker.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { addNoteToTree } from "../notes/storage/pg-tree.js";

// paths to skip during import
const IGNORED_PATHS = [
  "__MACOSX/",
  ".DS_Store",
  "Thumbs.db",
  ".git/",
  "node_modules/",
  "[Content_Types].xml",
  "_rels/",
  "docProps/",
  "ppt/",
  "word/",
  "xl/",
];

interface FolderQueryRow {
  note_id: string;
  parent_id: string | null;
  title: string;
  s3_key: string | null;
  content: string | null;
  is_folder: boolean;
}

interface VaultFolder {
  note_id: string;
}

interface ExportPath {
  path: string;
  title: string;
  s3Key: string | null;
  content: string | null;
}

/**
 * Check if a zip entry path should be ignored.
 */
export function shouldIgnore(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, "/");
  return IGNORED_PATHS.some(
    (path) => normalized.includes(path) || normalized.startsWith(path),
  );
}

/**
 * Sanitize a zip entry path — strip leading slashes, prevent traversal.
 * Returns null if the path is unsafe.
 */
export function sanitizePath(entryPath: string): string | null {
  let cleaned = entryPath.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[a-zA-Z]:\//.test(cleaned)) {
    return null;
  }
  if (cleaned.includes("../") || cleaned.includes("..\\") || cleaned === "..") {
    return null;
  }
  cleaned = cleaned.replace(/^[./]+/, "");
  return cleaned || null;
}

/**
 * Find or create a folder by title under a parent (non-Canvas version).
 * Uses title-based dedup instead of Canvas IDs.
 */
export async function findOrCreateVaultFolder(
  userId: string,
  title: string,
  parentId: string | null,
): Promise<string | null> {
  const existing = (await sql`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = true
      AND n.deleted_at IS NULL
      AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
    LIMIT 1
  `) as VaultFolder[];

  if (existing.length > 0) {
    return existing[0].note_id;
  }

  const noteId = uuidv4();
  try {
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
      VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', true, NOW(), NOW())
    `;
    await addNoteToTree(userId, noteId, parentId ?? null);
    return noteId;
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === "23505") {
      const [winner] = (await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
        WHERE n.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = true
          AND n.deleted_at IS NULL
          AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
        LIMIT 1
      `) as VaultFolder[];
      if (winner) {
        return winner.note_id;
      }
    }
    console.warn(`Failed to create vault folder "${title}": ${error.message}`);
    return parentId;
  }
}

/**
 * Ensure all folders in a path exist, returning the deepest folder's ID.
 * e.g. "Folder/Subfolder/file.pdf" creates "Folder" and "Subfolder", returns Subfolder's ID.
 */
export async function ensureFolderPath(
  userId: string,
  filePath: string,
  folderCache: Map<string, string>,
): Promise<string | null> {
  const parts = filePath.split("/");
  const folderParts = parts.slice(0, -1);

  if (folderParts.length === 0) {
    return null;
  }

  let parentId: string | null = null;
  let pathSoFar = "";

  for (const folderName of folderParts) {
    pathSoFar = pathSoFar ? `${pathSoFar}/${folderName}` : folderName;

    const cachedId = folderCache.get(pathSoFar);
    if (cachedId) {
      parentId = cachedId;
      continue;
    }

    parentId = await findOrCreateVaultFolder(userId, folderName, parentId);
    if (parentId) {
      folderCache.set(pathSoFar, parentId);
    }
  }

  return parentId;
}

/**
 * Build a path map from the user's tree for export.
 * Returns a Map of noteId to { path, title, s3Key, content }
 */
export async function buildExportPathMap(userId: string): Promise<Map<string, ExportPath>> {
  const rows = (await sql`
    SELECT
      t.note_id,
      t.parent_id,
      n.title,
      n.s3_key,
      n.content,
      n.is_folder
    FROM app.tree_items t
    JOIN app.notes n ON n.note_id = t.note_id AND n.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND n.deleted_at IS NULL
    ORDER BY n.title
  `) as FolderQueryRow[];

  const byId = new Map<string, FolderQueryRow>();
  for (const row of rows) {
    byId.set(row.note_id, row);
  }

  const getPath = (noteId: string, visited = new Set<string>()): string => {
    if (visited.has(noteId)) {
      return "";
    }
    visited.add(noteId);
    const node = byId.get(noteId);
    if (!node) {
      return "";
    }
    const parentPath = node.parent_id ? getPath(node.parent_id, visited) : "";
    return parentPath ? `${parentPath}/${node.title}` : node.title;
  };

  const exportMap = new Map<string, ExportPath>();
  for (const row of rows) {
    if (row.is_folder) {
      continue;
    }

    const path = getPath(row.note_id);
    if (!path) {
      continue;
    }

    let finalPath = path;
    if (!row.s3_key && row.content !== null && !finalPath.match(/\.\w+$/)) {
      finalPath += ".md";
    }

    exportMap.set(row.note_id, {
      path: finalPath,
      title: row.title,
      s3Key: row.s3_key,
      content: row.content,
    });
  }

  return exportMap;
}
