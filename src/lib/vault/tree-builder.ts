/**
 * Vault tree builder — maps between zip paths and note tree hierarchy.
 * Shared by import-worker and export-worker.
 */

import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";

// any path segment with one of these names is OS, VCS or app metadata
const IGNORED_SEGMENTS = new Set([
  "__MACOSX",
  ".git",
  "node_modules",
  ".obsidian",
]);
const IGNORED_FILENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
// OOXML internals of a .docx/.pptx/.xlsx. They only appear at the archive root
// when a stored Office file's own entries leak through the streaming reader,
// so a user's "Crossword/" or "notes/word/" folder must still import
const OOXML_ROOT_PREFIXES = [
  "[Content_Types].xml",
  "_rels/",
  "docProps/",
  "customXml/",
  "ppt/",
  "word/",
  "xl/",
];

const MAX_PATH_DEPTH = 32;
const MAX_SEGMENT_LENGTH = 255;

interface VaultFolder {
  note_id: string;
}

export class VaultImportCancelledError extends Error {
  constructor() {
    super("Vault import is no longer active");
    this.name = "VaultImportCancelledError";
  }
}

export class VaultTreeParentUnavailableError extends Error {
  constructor() {
    super("Vault import parent folder is no longer active");
    this.name = "VaultTreeParentUnavailableError";
  }
}

async function lockUserTree(tx: postgres.TransactionSql, userId: string): Promise<void> {
  await tx`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

export async function assertVaultImportJobActive(
  tx: postgres.TransactionSql,
  userId: string,
  jobId: string | undefined,
): Promise<void> {
  if (!jobId) return;
  const [job] = await tx`
    SELECT id
    FROM app.canvas_import_jobs
    WHERE id = ${jobId}::uuid
      AND user_id = ${userId}::uuid
      AND type = 'vault-import'
      AND status = 'processing'
    FOR KEY SHARE
  `;
  if (!job) throw new VaultImportCancelledError();
}

async function assertActiveParent(
  tx: postgres.TransactionSql,
  userId: string,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  const [parent] = await tx`
    SELECT note_id
    FROM app.notes
    WHERE note_id = ${parentId}::uuid
      AND user_id = ${userId}::uuid
      AND is_folder = TRUE
      AND deleted_at IS NULL
    FOR KEY SHARE
  `;
  if (!parent) throw new VaultTreeParentUnavailableError();
}

/**
 * Check if a zip entry path should be ignored.
 */
export function shouldIgnore(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, "/");
  if (OOXML_ROOT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  const segments = normalized.split("/");
  const filename = segments.at(-1) ?? "";
  return (
    IGNORED_FILENAMES.has(filename) ||
    segments.some((segment) => IGNORED_SEGMENTS.has(segment))
  );
}

/**
 * Normalise a zip entry path into note titles. Returns null for anything that
 * is absolute, escapes upward, carries control characters or is absurdly
 * deep. Entry names are only ever used as titles and object key suffixes,
 * never as filesystem paths, but they still must not smuggle structure.
 */
export function sanitizePath(entryPath: string): string | null {
  const normalized = entryPath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  if (/[\x00-\x1f\x7f]/.test(normalized)) return null;
  const segments = normalized
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (
    segments.length === 0 ||
    segments.length > MAX_PATH_DEPTH ||
    segments.some(
      (segment) => segment === ".." || segment.length > MAX_SEGMENT_LENGTH,
    )
  ) {
    return null;
  }
  return segments.join("/");
}

async function findVaultFolder(
  tx: postgres.TransactionSql,
  userId: string,
  title: string,
  parentId: string | null,
): Promise<string | null> {
  const [existing] = await tx<VaultFolder[]>`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = true
      AND n.deleted_at IS NULL
      AND t.parent_id IS NOT DISTINCT FROM ${parentId}::uuid
    LIMIT 1
  `;
  return existing?.note_id ?? null;
}

/**
 * Find or create a folder by title under a parent (non-Canvas version).
 * Imports merge into same-named folders that already exist. The user-tree
 * lock serialises concurrent lookups, so two entries cannot both create it.
 */
export async function findOrCreateVaultFolder(
  userId: string,
  title: string,
  parentId: string | null,
  jobId?: string,
): Promise<string> {
  const folderId = await sql.begin(async (tx: postgres.TransactionSql) => {
    // Use the same lock as Trash/Clear Vault so a background zip entry is
    // either visible to the destructive transaction or observes its job
    // cancellation before it creates a tree row.
    await lockUserTree(tx, userId);
    await assertVaultImportJobActive(tx, userId, jobId);
    await assertActiveParent(tx, userId, parentId);

    const existing = await findVaultFolder(tx, userId, title, parentId);
    if (existing) return existing;

    const noteId = uuidv4();
    await tx`
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
      VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', true, NOW(), NOW())
    `;
    await tx`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId}::uuid)
      ON CONFLICT (user_id, note_id) DO NOTHING
    `;
    return noteId;
  });
  return folderId;
}

/**
 * Create missing folders in a path and return the deepest folder's ID.
 * e.g. "Folder/Subfolder/file.pdf" creates "Folder" and "Subfolder", returns Subfolder's ID.
 */
export async function ensureFolderPath(
  userId: string,
  filePath: string,
  folderCache: Map<string, string>,
  jobId?: string,
): Promise<string | null> {
  const folderParts = filePath.split("/").slice(0, -1);
  let parentId: string | null = null;
  let pathSoFar = "";

  for (const folderName of folderParts) {
    pathSoFar = pathSoFar ? `${pathSoFar}/${folderName}` : folderName;

    const cachedId = folderCache.get(pathSoFar);
    if (cachedId) {
      parentId = cachedId;
      continue;
    }

    parentId = await findOrCreateVaultFolder(
      userId,
      folderName,
      parentId,
      jobId,
    );
    folderCache.set(pathSoFar, parentId);
  }

  return parentId;
}

interface ExportTreeRow {
  note_id: string;
  parent_id: string | null;
  title: string | null;
  s3_key: string | null;
  is_folder: boolean;
}

export type ExportSource =
  | { kind: "object"; s3Key: string }
  | { kind: "content"; noteId: string };

export interface ExportEntry {
  path: string;
  source: ExportSource;
}

const TEXT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return match ? match[1].toLowerCase() : null;
}

// titles are free text, but each one must stay a single archive path segment
function safeSegment(title: string | null): string {
  const cleaned = (title ?? "")
    .replace(/[\x00-\x1f\x7f/\\]/g, "_")
    .trim();
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "Untitled";
  return cleaned.slice(0, MAX_SEGMENT_LENGTH);
}

function exportFilename(row: ExportTreeRow, source: ExportSource): string {
  const name = safeSegment(row.title);
  const ext = extensionOf(name);
  if (source.kind === "content") {
    return ext && TEXT_EXTENSIONS.has(ext) ? name : `${name}.md`;
  }
  // a renamed upload ("Lecture 1") still needs its real extension to open
  const objectExt = extensionOf(source.s3Key);
  return objectExt && ext !== objectExt ? `${name}.${objectExt}` : name;
}

/**
 * Editable notes export what the editor shows. Imported .md/.txt files keep
 * their original upload as s3_key, but edits only ever land in content.
 */
function exportSource(row: ExportTreeRow): ExportSource {
  const ext = extensionOf(row.title ?? "");
  if (row.s3_key && !(ext && TEXT_EXTENSIONS.has(ext))) {
    return { kind: "object", s3Key: row.s3_key };
  }
  return { kind: "content", noteId: row.note_id };
}

/** Claim a sibling name, suffixing " (2)" etc. Zip tools and most file systems collide case-insensitively. */
function claimName(used: Set<string>, name: string): string {
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build the archive layout for a user's live tree. Every path is unique and
 * made of safe segments, so two same-titled notes cannot overwrite each other
 * when the archive is extracted. Note bodies are not loaded here; the export
 * reads each one as it is written to keep memory flat on large vaults.
 */
export async function buildExportPathMap(userId: string): Promise<ExportEntry[]> {
  const rows = await sql<ExportTreeRow[]>`
    SELECT t.note_id, t.parent_id, n.title, n.s3_key, n.is_folder
    FROM app.tree_items t
    JOIN app.notes n ON n.note_id = t.note_id AND n.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND n.deleted_at IS NULL
    ORDER BY n.title, n.created_at, n.note_id
  `;

  const byId = new Map(rows.map((row) => [row.note_id, row]));
  const children = new Map<string | null, ExportTreeRow[]>();
  for (const row of rows) {
    // anything whose parent is missing (trashed or outside the tree) goes to the root
    const parentId =
      row.parent_id && byId.has(row.parent_id) ? row.parent_id : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(row);
    children.set(parentId, siblings);
  }

  const entries: ExportEntry[] = [];
  const visited = new Set<string>();
  const usedAtRoot = new Set<string>();

  const walk = (
    siblings: ExportTreeRow[],
    directory: string,
    used: Set<string>,
  ) => {
    for (const row of siblings) {
      if (visited.has(row.note_id)) continue;
      visited.add(row.note_id);

      if (!row.is_folder) {
        const source = exportSource(row);
        const name = claimName(used, exportFilename(row, source));
        entries.push({ path: `${directory}${name}`, source });
      }
      const nested = children.get(row.note_id);
      if (nested) {
        const folderName = claimName(used, safeSegment(row.title));
        walk(nested, `${directory}${folderName}/`, new Set());
      }
    }
  };

  walk(children.get(null) ?? [], "", usedAtRoot);
  // parent cycles are never reachable from the root; export them there rather than drop them
  walk(rows.filter((row) => !visited.has(row.note_id)), "", usedAtRoot);

  return entries;
}
