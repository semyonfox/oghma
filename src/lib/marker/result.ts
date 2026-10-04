import { createHash } from "node:crypto";

const MARKER_RESULT_SCHEMA_VERSION = 1;
export { markerResultByteLimit } from "./output";
import { validateMarkerOutput, markerResultByteLimit, type MarkerMetadata } from "./output";

const PAGE_RANGE_PATTERN = /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;
const IMAGE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

export interface MarkerResultExpectation {
  callbackId: string;
  resultKey: string;
}

export interface ValidatedMarkerResult {
  output: string;
  images: Record<string, string>;
  metadata: MarkerMetadata;
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
  let output;
  try {
    output = validateMarkerOutput(parsed);
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Invalid Marker output");
  }
  for (const [name, encoded] of Object.entries(output.images)) {
    if (!IMAGE_NAME_PATTERN.test(name)) invalid("Marker image name is invalid");
    if (!imageHasExpectedMagic(name, Buffer.from(encoded, "base64"))) {
      invalid(`Marker image ${name} does not match its extension`);
    }
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
    output: output.output,
    images: output.images,
    metadata: output.metadata,
    pageRange,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
