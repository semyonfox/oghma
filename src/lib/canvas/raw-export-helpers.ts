import { stripHtmlToText } from "./content-formatting";
import type { CanvasRecord } from "./client";
import type {
  CanvasRawExportArchive,
  DownloadEntry,
  DownloadableFile,
  QueryValue,
  RawExportClient,
  RawExportState,
  TextEntry,
} from "./raw-export-types";

export function sanitizeZipPart(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim() || fallback;
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/^\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 180);
}

export function entryName(file: CanvasRecord) {
  return sanitizeZipPart(
    file.display_name ?? file.filename ?? file.name,
    `canvas-file-${file.id ?? "unknown"}`,
  );
}

function withUniquePath(path: string, seenPaths: Set<string>) {
  let candidate = path;
  let index = 2;
  while (seenPaths.has(candidate)) {
    const dot = path.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${path.slice(0, dot)} (${index})${path.slice(dot)}`
        : `${path} (${index})`;
    index += 1;
  }
  seenPaths.add(candidate);
  return candidate;
}

export function pathWithQuery(
  path: string,
  params: Record<string, QueryValue> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(`${key}[]`, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function jsonText(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownFromHtml(
  title: unknown,
  html: unknown,
  metadata: Record<string, unknown> = {},
) {
  const lines = [`# ${String(title)}`, ""];
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }
  if (Object.keys(metadata).length > 0) lines.push("");
  lines.push(stripHtmlToText(typeof html === "string" ? html : ""));
  return `${lines.join("\n").trim()}\n`;
}

function addTextEntry(
  textEntries: TextEntry[],
  seenPaths: Set<string>,
  path: string,
  content: unknown,
) {
  textEntries.push({
    path: withUniquePath(path, seenPaths),
    content: typeof content === "string" ? content : jsonText(content ?? null),
  });
}

export function addJsonEntry(
  textEntries: TextEntry[],
  seenPaths: Set<string>,
  path: string,
  value: unknown,
) {
  addTextEntry(textEntries, seenPaths, path, jsonText(value));
}

export function addMarkdownEntry(
  textEntries: TextEntry[],
  seenPaths: Set<string>,
  path: string,
  title: unknown,
  html: unknown,
  metadata: Record<string, unknown>,
) {
  addTextEntry(
    textEntries,
    seenPaths,
    path,
    markdownFromHtml(title, html, metadata),
  );
}

export function addJsonEntryIfPresent(
  textEntries: TextEntry[],
  seenPaths: Set<string>,
  path: string,
  value: unknown,
) {
  if (value !== null && value !== undefined) {
    addJsonEntry(textEntries, seenPaths, path, value);
  }
}

export async function getJson(
  client: RawExportClient,
  path: string,
  label: string,
  skipped: string[],
) {
  const { data, forbidden, error } = await client.getPath(path);
  if (forbidden || error) {
    skipped.push(`${label}: ${error ?? "restricted"}`);
    return null;
  }
  return data ?? null;
}

export async function getPaginatedJson(
  client: RawExportClient,
  path: string,
  label: string,
  skipped: string[],
) {
  const { data, forbidden, error } = await client.getPaginatedPath(path);
  if (forbidden || error) {
    skipped.push(`${label}: ${error ?? "restricted"}`);
    return [];
  }
  if (!Array.isArray(data)) {
    skipped.push(`${label}: unexpected response shape`);
    return [];
  }
  return data.filter(isRecord);
}

export function collectFile(
  downloads: DownloadEntry[],
  file: CanvasRecord,
  path: string,
  state: RawExportState,
) {
  if (!hasDownloadUrl(file)) {
    state.skipped.push(`${path}: missing download URL`);
    return;
  }
  const fileId = file.id ?? file.uuid ?? null;
  if (fileId != null && state.seenFileIds.has(String(fileId))) return;
  if (fileId != null) state.seenFileIds.add(String(fileId));
  downloads.push({ path: withUniquePath(path, state.seenPaths), file });
}

function hasDownloadUrl(file: CanvasRecord): file is DownloadableFile {
  return typeof file.url === "string" && file.url.length > 0;
}

export async function collectFileById(
  client: RawExportClient,
  courseId: string,
  fileId: unknown,
  path: string,
  downloads: DownloadEntry[],
  state: RawExportState,
) {
  const file = await getJson(
    client,
    `/courses/${courseId}/files/${fileId}`,
    path,
    state.skipped,
  );
  if (isRecord(file)) {
    collectFile(downloads, file, `${path}/${entryName(file)}`, state);
  }
}

export function recordArray(value: unknown): CanvasRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function isRecord(value: unknown): value is CanvasRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectSubmissionAttachments(
  downloads: DownloadEntry[],
  submissionValue: unknown,
  basePath: string,
  state: RawExportState,
) {
  if (!isRecord(submissionValue)) return;
  for (const attachment of recordArray(submissionValue.attachments)) {
    collectFile(
      downloads,
      attachment,
      `${basePath}/${entryName(attachment)}`,
      state,
    );
  }
  for (const history of recordArray(submissionValue.submission_history)) {
    for (const attachment of recordArray(history.attachments)) {
      collectFile(
        downloads,
        attachment,
        `${basePath}/history-${history.attempt ?? "unknown"}/${entryName(attachment)}`,
        state,
      );
    }
  }
}

function isFileLike(value: unknown): value is DownloadableFile {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    Boolean(
      value.display_name ||
      value.filename ||
      value.name ||
      value.content_type ||
      value["content-type"] ||
      value.size,
    )
  );
}

export function collectDownloadableAttachments(
  value: unknown,
  basePath: string,
  downloads: DownloadEntry[],
  state: RawExportState,
) {
  if (!value || typeof value !== "object") return;
  if (isFileLike(value)) {
    collectFile(downloads, value, `${basePath}/${entryName(value)}`, state);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDownloadableAttachments(item, basePath, downloads, state);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        "attachments",
        "attachment",
        "files",
        "file",
        "submission_history",
        "messages",
        "entries",
        "view",
      ].includes(key)
    ) {
      collectDownloadableAttachments(
        child,
        `${basePath}/${key}`,
        downloads,
        state,
      );
    }
  }
}

export async function collectContextFiles(
  client: RawExportClient,
  apiBase: string,
  archivePath: string,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const quota = await getJson(
    client,
    `${apiBase}/files/quota`,
    `${archivePath}/quota.json`,
    state.skipped,
  );
  addJsonEntryIfPresent(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/quota.json`,
    quota,
  );
  const folders = await getPaginatedJson(
    client,
    `${apiBase}/folders`,
    `${archivePath}/folders.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/folders.json`,
    folders,
  );
  const files = await getPaginatedJson(
    client,
    `${apiBase}/files`,
    `${archivePath}/files.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/files.json`,
    files,
  );
  for (const file of files) {
    collectFile(
      archive.downloads,
      file,
      `${archivePath}/downloads/${entryName(file)}`,
      state,
    );
  }
  const licenses = await getPaginatedJson(
    client,
    `${apiBase}/content_licenses`,
    `${archivePath}/content-licenses.json`,
    state.skipped,
  );
  if (licenses.length > 0) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${archivePath}/content-licenses.json`,
      licenses,
    );
  }
}

export async function collectGenericPaginated(
  client: RawExportClient,
  path: string,
  archivePath: string,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const data = await getPaginatedJson(client, path, archivePath, state.skipped);
  addJsonEntry(archive.textEntries, state.seenPaths, archivePath, data);
  collectDownloadableAttachments(
    data,
    archivePath.replace(/\.json$/, ""),
    archive.downloads,
    state,
  );
  return data;
}

export async function collectGenericObject(
  client: RawExportClient,
  path: string,
  archivePath: string,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const data = await getJson(client, path, archivePath, state.skipped);
  if (data !== null && data !== undefined) {
    addJsonEntry(archive.textEntries, state.seenPaths, archivePath, data);
    collectDownloadableAttachments(
      data,
      archivePath.replace(/\.json$/, ""),
      archive.downloads,
      state,
    );
  }
  return data;
}
