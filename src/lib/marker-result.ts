import { createHash } from "node:crypto";

export const MARKER_RESULT_SCHEMA_VERSION = 1;
export const DEFAULT_MARKER_MAX_RESULT_BYTES = 128 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGE_TOTAL_BYTES = 96 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_METADATA_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MARKER_MAX_IMAGES = 256;

const PAGE_RANGE_PATTERN = /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;
const IMAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface MarkerResultExpectation {
  callbackId: string;
  resultKey: string;
}

export interface ValidatedMarkerResult {
  output: string;
  images: Record<string, string>;
  metadata: JsonValue | null;
  pageRange: string | null;
  byteLength: number;
  sha256: string;
}

export class MarkerResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkerResultValidationError";
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredLimit(name: string, fallback: number): number {
  return positiveInteger(process.env[name], fallback);
}

export function markerResultByteLimit(): number {
  return configuredLimit("MARKER_MAX_RESULT_BYTES", DEFAULT_MARKER_MAX_RESULT_BYTES);
}

function invalid(message: string): never {
  throw new MarkerResultValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function asBuffer(value: string | Buffer): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
}

function isStrictBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 && decoded.toString("base64") === value;
}

function imageHasExpectedMagic(name: string, bytes: Buffer): boolean {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (extension === "jpg" || extension === "jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === "webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function validateImages(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) invalid("Marker result images must be an object");

  const entries = Object.entries(value);
  const maxImages = configuredLimit("MARKER_MAX_RESULT_IMAGES", DEFAULT_MARKER_MAX_IMAGES);
  const maxImageBytes = configuredLimit(
    "MARKER_MAX_RESULT_IMAGE_BYTES",
    DEFAULT_MARKER_MAX_IMAGE_BYTES,
  );
  const maxTotalBytes = configuredLimit(
    "MARKER_MAX_RESULT_IMAGE_TOTAL_BYTES",
    DEFAULT_MARKER_MAX_IMAGE_TOTAL_BYTES,
  );
  if (entries.length > maxImages) {
    invalid(`Marker result has more than ${maxImages} images`);
  }

  const images: Record<string, string> = {};
  let totalBytes = 0;
  for (const [name, encoded] of entries) {
    if (!IMAGE_NAME_PATTERN.test(name) || !/\.(?:png|jpe?g|webp)$/i.test(name)) {
      invalid(`Marker image name is invalid: ${name.slice(0, 64)}`);
    }
    if (typeof encoded !== "string" || !isStrictBase64(encoded)) {
      invalid(`Marker image ${name} is not strict base64`);
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > maxImageBytes) {
      invalid(`Marker image ${name} exceeds the per-image limit`);
    }
    totalBytes += bytes.length;
    if (totalBytes > maxTotalBytes) {
      invalid("Marker result images exceed the aggregate limit");
    }
    if (!imageHasExpectedMagic(name, bytes)) {
      invalid(`Marker image ${name} does not match its extension`);
    }
    images[name] = encoded;
  }
  return images;
}

function validateMetadata(value: unknown): JsonValue | null {
  if (value === undefined || value === null) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid("Marker result metadata is not JSON serializable");
  }
  if (Buffer.byteLength(serialized!, "utf8") > configuredLimit(
    "MARKER_MAX_RESULT_METADATA_BYTES",
    DEFAULT_MARKER_MAX_METADATA_BYTES,
  )) {
    invalid("Marker result metadata exceeds the size limit");
  }
  return value as JsonValue;
}

/**
 * Parse the v1 object written by the trusted Vast Marker worker. This runs
 * before any Markdown, image, database, or embedding write.
 */
export function parseMarkerResult(
  input: string | Buffer,
  expected: MarkerResultExpectation,
): ValidatedMarkerResult {
  const bytes = asBuffer(input);
  const maxResultBytes = markerResultByteLimit();
  if (bytes.length === 0) invalid("Marker result is empty");
  if (bytes.length > maxResultBytes) {
    invalid(`Marker result exceeds MARKER_MAX_RESULT_BYTES=${maxResultBytes}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    invalid("Marker result is not valid JSON");
  }
  if (!isPlainObject(parsed)) invalid("Marker result must be a JSON object");
  if (parsed.schema_version !== MARKER_RESULT_SCHEMA_VERSION) {
    invalid("Marker result schema_version is unsupported");
  }
  if (parsed.request_id !== expected.callbackId) {
    invalid("Marker result request_id does not match its job");
  }
  if (parsed.result_key !== expected.resultKey) {
    invalid("Marker result result_key does not match its job");
  }
  if (parsed.success !== true) invalid("Marker result did not report success");
  if (parsed.format !== "markdown") {
    invalid("Marker result format must be markdown");
  }
  if (typeof parsed.output !== "string") {
    invalid("Marker result output must be a string");
  }
  if (!parsed.output.trim()) invalid("Marker result output is empty");
  if (Buffer.byteLength(parsed.output, "utf8") > configuredLimit(
    "MARKER_MAX_RESULT_OUTPUT_BYTES",
    DEFAULT_MARKER_MAX_OUTPUT_BYTES,
  )) {
    invalid("Marker result output exceeds the size limit");
  }

  let pageRange: string | null = null;
  if (parsed.page_range !== undefined && parsed.page_range !== null) {
    if (
      typeof parsed.page_range !== "string" ||
      parsed.page_range.length > 128 ||
      !PAGE_RANGE_PATTERN.test(parsed.page_range)
    ) {
      invalid("Marker result page_range is invalid");
    }
    pageRange = parsed.page_range;
  }

  return {
    output: parsed.output,
    images: validateImages(parsed.images),
    metadata: validateMetadata(parsed.metadata),
    pageRange,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
