import { ApiError } from "@/lib/api-error";

const DEFAULT_TITLE_LENGTH = 500;
const DEFAULT_CONTENT_LENGTH = 5 * 1024 * 1024;

// an unparseable override must not silently remove the limit
function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const MAX_NOTE_TITLE_LENGTH = Math.min(
  positiveInteger(process.env.MAX_TITLE_LENGTH, DEFAULT_TITLE_LENGTH),
  DEFAULT_TITLE_LENGTH,
);
export const MAX_NOTE_CONTENT_LENGTH = positiveInteger(
  process.env.MAX_CONTENT_LENGTH,
  DEFAULT_CONTENT_LENGTH,
);

// JSON escaping inflates content (quotes, newlines, non-ASCII), so the body
// cap leaves room for the largest note the length check below accepts
export const MAX_NOTE_BODY_BYTES = MAX_NOTE_CONTENT_LENGTH * 2 + 64 * 1024;

export function assertNoteLengths(body: { title?: string; content?: string }): void {
  if (body.title !== undefined && body.title.length > MAX_NOTE_TITLE_LENGTH) {
    throw new ApiError(400, `Title must be ${MAX_NOTE_TITLE_LENGTH} characters or fewer`);
  }
  if (body.content !== undefined && body.content.length > MAX_NOTE_CONTENT_LENGTH) {
    throw new ApiError(400, `Content must be ${MAX_NOTE_CONTENT_LENGTH} characters or fewer`);
  }
}
