import type { StoreS3 } from "@/lib/storage/s3";

export type MarkerImages = Record<string, string>;

export const DEFAULT_MARKER_MAX_RESULT_BYTES = 128 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGE_TOTAL_BYTES = 96 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_METADATA_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGES = 256;

export type MarkerMetadata =
  | null
  | boolean
  | number
  | string
  | MarkerMetadata[]
  | { [key: string]: MarkerMetadata };

export interface ValidatedMarkerOutput {
  output: string;
  images: MarkerImages;
  metadata: MarkerMetadata;
}

export class MarkerOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkerOutputValidationError";
  }
}

function configuredLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function markerResultByteLimit(): number {
  return configuredLimit(
    "MARKER_MAX_RESULT_BYTES",
    DEFAULT_MARKER_MAX_RESULT_BYTES,
  );
}

function invalid(message: string): never {
  throw new MarkerOutputValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOutput(value: unknown): string {
  if (typeof value !== "string") invalid("Marker output must be a string");
  const limit = configuredLimit(
    "MARKER_MAX_RESULT_OUTPUT_BYTES",
    DEFAULT_MARKER_MAX_OUTPUT_BYTES,
  );
  if (value.length > limit || Buffer.byteLength(value, "utf8") > limit) {
    invalid("Marker output exceeds the size limit");
  }
  if (!value.trim()) invalid("Marker output is empty");
  return value;
}

function validateImages(value: unknown): MarkerImages {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) invalid("Marker images must be an object");

  const maxImages = configuredLimit(
    "MARKER_MAX_RESULT_IMAGES",
    DEFAULT_MARKER_MAX_IMAGES,
  );
  const maxImageBytes = configuredLimit(
    "MARKER_MAX_RESULT_IMAGE_BYTES",
    DEFAULT_MARKER_MAX_IMAGE_BYTES,
  );
  const maxTotalBytes = configuredLimit(
    "MARKER_MAX_RESULT_IMAGE_TOTAL_BYTES",
    DEFAULT_MARKER_MAX_IMAGE_TOTAL_BYTES,
  );
  const images: MarkerImages = {};
  const names = new Set<string>();
  let count = 0;
  let totalBytes = 0;

  for (const name in value) {
    if (!Object.hasOwn(value, name)) continue;
    if (++count > maxImages) invalid("Marker images exceed the count limit");
    if (name.length > 1024) invalid("Marker image name exceeds the size limit");
    const safeName = sanitizeMarkerAssetName(name);
    if (
      !safeName ||
      safeName.length > 128 ||
      !/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(safeName)
    ) {
      invalid("Marker image name is invalid");
    }
    if (names.has(safeName))
      invalid("Marker image names collide after sanitizing");
    names.add(safeName);

    const encoded = value[name];
    if (typeof encoded !== "string" || !encoded || encoded.length % 4 !== 0) {
      invalid("Marker image is not strict base64");
    }
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    const byteLength = (encoded.length / 4) * 3 - padding;
    if (byteLength > maxImageBytes)
      invalid("Marker image exceeds the per-image limit");
    totalBytes += byteLength;
    if (totalBytes > maxTotalBytes)
      invalid("Marker images exceed the aggregate limit");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      invalid("Marker image is not strict base64");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lastValue = alphabet.indexOf(encoded[encoded.length - padding - 1]);
    if (
      (padding === 2 && (lastValue & 15) !== 0) ||
      (padding === 1 && (lastValue & 3) !== 0)
    ) {
      invalid("Marker image is not canonical base64");
    }
    images[name] = encoded;
  }
  return images;
}

function validateMetadata(value: unknown): MarkerMetadata {
  if (value === undefined || value === null) return null;
  let remainingBytes = configuredLimit(
    "MARKER_MAX_RESULT_METADATA_BYTES",
    DEFAULT_MARKER_MAX_METADATA_BYTES,
  );
  let nodes = 0;
  const ancestors = new Set<object>();

  function consume(bytes: number): void {
    remainingBytes -= bytes;
    if (remainingBytes < 0) invalid("Marker metadata exceeds the size limit");
  }

  function jsonString(value: string): void {
    if (value.length > remainingBytes)
      invalid("Marker metadata exceeds the size limit");
    consume(2);
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code === 0x22 || code === 0x5c) {
        consume(2);
      } else if (code < 0x20) {
        const shortEscape =
          code === 0x08 ||
          code === 0x09 ||
          code === 0x0a ||
          code === 0x0c ||
          code === 0x0d;
        consume(shortEscape ? 2 : 6);
      } else if (code < 0x80) {
        consume(1);
      } else if (code < 0x800) {
        consume(2);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          consume(4);
          index++;
        } else {
          consume(6);
        }
      } else {
        consume(code >= 0xdc00 && code <= 0xdfff ? 6 : 3);
      }
    }
  }

  function visit(entry: unknown, depth: number): MarkerMetadata {
    if (++nodes > 100_000 || depth > 32)
      invalid("Marker metadata exceeds the structure limit");
    if (entry === null || typeof entry === "boolean") {
      consume(entry === null ? 4 : entry ? 4 : 5);
      return entry;
    }
    if (typeof entry === "string") {
      jsonString(entry);
      return entry;
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      consume(JSON.stringify(entry).length);
      return entry;
    }
    if (!Array.isArray(entry) && !isPlainObject(entry)) {
      invalid("Marker metadata must contain only JSON values");
    }
    if (ancestors.has(entry)) invalid("Marker metadata contains a cycle");
    ancestors.add(entry);
    consume(2);
    try {
      if (Array.isArray(entry)) {
        if (entry.length > 100_000 - nodes)
          invalid("Marker metadata exceeds the structure limit");
        const result: MarkerMetadata[] = [];
        for (let index = 0; index < entry.length; index++) {
          if (index) consume(1);
          result.push(visit(entry[index], depth + 1));
        }
        return result;
      }
      const result: { [key: string]: MarkerMetadata } = {};
      let count = 0;
      for (const key in entry) {
        if (!Object.hasOwn(entry, key)) continue;
        if (count++) consume(1);
        jsonString(key);
        consume(1);
        Object.defineProperty(result, key, {
          value: visit(entry[key], depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    } finally {
      ancestors.delete(entry);
    }
  }

  return visit(value, 0);
}

export function validateMarkerOutput(value: unknown): ValidatedMarkerOutput {
  if (!isPlainObject(value)) invalid("Marker output must be an object");
  return {
    output: validateOutput(value.output),
    images: validateImages(value.images),
    metadata: validateMetadata(value.metadata),
  };
}

const MARKER_SPAN_RE = /<span\s+id="page-[^"]+"\s*><\/span>/g;
const MARKER_PAGE_LINE_RE = /^\s*\\?--\s*\d+\s+of\s+\d+\s*--\s*$/gim;
const MARKER_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

function inferImageMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "image/jpeg";
}

export function normalizeMarkerMarkdown(markdown: string): string {
  return markdown
    .replace(MARKER_SPAN_RE, "")
    .replace(MARKER_PAGE_LINE_RE, "")
    .replace(/^\s{0,3}\{\d+\}-+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeMarkerAssetName(name: string): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;

  const leaf = trimmed.split(/[\\/]/).pop() ?? "";
  if (!leaf) return null;

  const safe = leaf.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe === "." || safe === "..") return null;
  return safe;
}

export function markerAssetKey(
  userId: string,
  noteId: string,
  assetName: string,
): string {
  return `${markerAssetPrefix(userId, noteId)}${assetName}`;
}

/** The complete private object namespace for one note's Marker output. */
export function markerAssetPrefix(userId: string, noteId: string): string {
  return `marker/${userId}/${noteId}/`;
}

export function markerMetadataKey(userId: string, noteId: string): string {
  return markerAssetKey(userId, noteId, "_metadata.json");
}

interface PersistMarkerAssetsParams {
  storage: StoreS3;
  userId: string;
  noteId: string;
  markdown: string;
  images?: MarkerImages | null;
  metadata?: unknown;
}

interface PersistMarkerAssetsResult {
  markdown: string;
  imageCount: number;
}

export async function persistMarkerAssetsForNote({
  storage,
  userId,
  noteId,
  markdown,
  images,
  metadata,
}: PersistMarkerAssetsParams): Promise<PersistMarkerAssetsResult> {
  const validated = validateMarkerOutput({
    output: markdown,
    images,
    metadata,
  });
  const imageEntries = Object.entries(validated.images).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

  if (validated.metadata != null) {
    await storage.putObject(
      markerMetadataKey(userId, noteId),
      JSON.stringify(validated.metadata),
      { contentType: "application/json" },
    );
  }

  if (!imageEntries.length) {
    return { markdown, imageCount: 0 };
  }

  const rewrite = new Map<string, string>();
  let storedCount = 0;

  for (const [originalName, encoded] of imageEntries) {
    const safeName = sanitizeMarkerAssetName(originalName);
    if (!safeName || !encoded) continue;

    const key = markerAssetKey(userId, noteId, safeName);
    const bytes = Buffer.from(encoded, "base64");

    await storage.putObject(key, bytes, {
      contentType: inferImageMimeType(safeName),
    });
    storedCount += 1;

    rewrite.set(originalName.trim(), safeName);
    rewrite.set(safeName, safeName);
  }

  const rewrittenMarkdown = markdown.replace(
    MARKER_IMAGE_RE,
    (full, altText: string, rawUrl: string) => {
      const cleaned = rawUrl.trim().replace(/^\.\//, "");
      const safeName = rewrite.get(cleaned);
      if (!safeName) return full;

      const url = `/api/notes/${noteId}/assets?name=${encodeURIComponent(safeName)}`;
      return `![${altText}](${url})`;
    },
  );

  return { markdown: rewrittenMarkdown, imageCount: storedCount };
}
