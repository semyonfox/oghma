const MAX_STORAGE_NAME_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 255;

// keep a short trailing extension when trimming so `.pdf` survives for type
// handling and the extracted-note pairing in /api/ingestion-status
function capPreservingExtension(name: string, max: number): string {
  if (name.length <= max) return name;
  const extension = /\.[^.\s]{1,10}$/u.exec(name)?.[0] ?? "";
  return name.slice(0, max - extension.length) + extension;
}

/**
 * ASCII-only object key segment. Never empty and never contains `/` or `..`,
 * so it cannot escape the key prefix it is appended to.
 */
export function storageFileName(name: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "");
  return capPreservingExtension(safe || "file", MAX_STORAGE_NAME_LENGTH);
}

/**
 * Human-facing name for a note created from an uploaded file. Keeps spaces
 * and accents (macOS sends NFD names, so normalise to NFC) and only strips
 * control characters.
 */
export function displayFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .trim();
  return capPreservingExtension(cleaned || "unnamed", MAX_DISPLAY_NAME_LENGTH);
}

/**
 * Every upload gets its own attachment directory, so names never collide.
 * `fileName` must already be a `storageFileName` result.
 */
export function noteAttachmentKey(
  noteId: string,
  attachmentId: string,
  fileName: string,
): string {
  return `notes/${noteId}/${attachmentId}/${fileName}`;
}
