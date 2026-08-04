import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  MarkerResultValidationError,
  parseMarkerResult,
} from "@/lib/marker-result";

const callbackId = "11111111-1111-4111-8111-111111111111";
const resultKey = `marker-results/${callbackId}.json`;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    request_id: callbackId,
    result_key: resultKey,
    success: true,
    format: "markdown",
    output: "# Extracted notes",
    images: {},
    metadata: { pages: 1 },
    ...overrides,
  };
}

function parse(value: Record<string, unknown>) {
  return parseMarkerResult(JSON.stringify(value), { callbackId, resultKey });
}

afterEach(() => {
  delete process.env.MARKER_MAX_RESULT_BYTES;
  delete process.env.MARKER_MAX_RESULT_IMAGES;
  delete process.env.MARKER_MAX_RESULT_IMAGE_BYTES;
  delete process.env.MARKER_MAX_RESULT_IMAGE_TOTAL_BYTES;
  delete process.env.MARKER_MAX_RESULT_METADATA_BYTES;
  delete process.env.MARKER_MAX_RESULT_OUTPUT_BYTES;
});

describe("parseMarkerResult", () => {
  it("accepts a bound v1 Markdown result and records its immutable digest", () => {
    const value = payload();
    const raw = JSON.stringify(value);
    const result = parse(value);

    expect(result).toMatchObject({
      output: "# Extracted notes",
      pageRange: null,
      metadata: { pages: 1 },
      byteLength: Buffer.byteLength(raw),
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
  });

  it.each([
    ["schema version", payload({ schema_version: 2 })],
    ["request binding", payload({ request_id: "other" })],
    ["result key binding", payload({ result_key: "marker-results/other.json" })],
    ["failure envelope", payload({ success: false })],
    ["format", payload({ format: "html" })],
    ["empty output", payload({ output: " \n " })],
    ["invalid page range", payload({ page_range: "1--2" })],
  ])("rejects an invalid %s", (_name, value) => {
    expect(() => parse(value as Record<string, unknown>)).toThrow(
      MarkerResultValidationError,
    );
  });

  it("rejects a path-like image name before asset persistence", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]).toString("base64");
    expect(() => parse(payload({ images: { "../image.png": png } }))).toThrow(
      /image name/i,
    );
  });

  it("rejects base64 that does not match its claimed image extension", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");
    expect(() => parse(payload({ images: { "image.png": jpeg } }))).toThrow(
      /does not match/i,
    );
  });

  it("enforces the result byte limit before parsing", () => {
    process.env.MARKER_MAX_RESULT_BYTES = "32";
    expect(() => parse(payload())).toThrow(/MARKER_MAX_RESULT_BYTES/);
  });
});
