const BIGINT_COLUMN_MAX = BigInt("9223372036854775807");

export interface CanvasCourseSelection {
  id: string;
  name: string;
  course_code: string;
  term: { id?: string; name?: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Canonicalize a Canvas ID without ever rounding it through Number.
 * JSON numbers outside the safe range are rejected because their original
 * decimal value has already been lost by JSON.parse.
 */
export function canvasIdString(value: unknown, label = "Canvas ID") {
  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error(`${label} must be a non-negative decimal string or safe integer`);
}

export function canvasIdForBigintColumn(value: unknown, label = "Canvas ID") {
  const id = canvasIdString(value, label);
  if (BigInt(id) > BIGINT_COLUMN_MAX) {
    throw new Error(`${label} exceeds the supported Canvas ID range`);
  }
  return id;
}

function optionalString(value: unknown, fallback: string, label: string) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function normalizeCanvasTerm(value: unknown): CanvasCourseSelection["term"] {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { name: value };
  if (!isRecord(value)) {
    throw new Error("Canvas course term must be an object, string, or null");
  }

  const term: NonNullable<CanvasCourseSelection["term"]> = {};
  if (Object.prototype.hasOwnProperty.call(value, "id")) {
    term.id = canvasIdForBigintColumn(value.id, "Canvas term ID");
  }
  if (Object.prototype.hasOwnProperty.call(value, "name")) {
    term.name = optionalString(value.name, "", "Canvas course term name");
  }
  return term;
}

/**
 * Normalize the compact course metadata persisted in import jobs and passed to
 * the raw-export pipeline. Unknown client fields are deliberately discarded so
 * every producer and consumer sees the same shape.
 */
export function normalizeCanvasCourseSelection(value: unknown): CanvasCourseSelection {
  if (!isRecord(value)) {
    const id = canvasIdForBigintColumn(value, "Canvas course ID");
    return { id, name: id, course_code: "", term: null };
  }

  const id = canvasIdForBigintColumn(value.id, "Canvas course ID");
  return {
    id,
    name: optionalString(value.name, id, "Canvas course name"),
    course_code: optionalString(
      value.course_code,
      "",
      "Canvas course code",
    ),
    term: normalizeCanvasTerm(value.term),
  };
}

// `-1` is an internal module sentinel used for Canvas items that do not
// belong to a module. It is deliberately separate from Canvas ID validation.
export function canvasModuleIdForBigintColumn(value: unknown) {
  if (value === -1 || value === "-1") return "-1";
  return canvasIdForBigintColumn(value, "Canvas module ID");
}
