import { describe, expect, it } from "vitest";
import {
  buildInternalNoteHref,
  extractInternalNoteIds,
  parseInternalNoteHref,
} from "@/lib/notes/internal-links";

const FIRST = "01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d";
const SECOND = "123e4567-e89b-42d3-a456-426614174000";

describe("internal note links", () => {
  it("builds and parses canonical note routes", () => {
    expect(buildInternalNoteHref(FIRST)).toBe(`/notes/${FIRST}`);
    expect(parseInternalNoteHref(`/notes/${FIRST}`)).toBe(FIRST);
    expect(parseInternalNoteHref(`/notes/${SECOND}#overview`)).toBe(SECOND);
  });

  it("rejects external and non-note routes", () => {
    expect(parseInternalNoteHref(`https://example.com/notes/${FIRST}`)).toBeNull();
    expect(parseInternalNoteHref(`/chat/${FIRST}`)).toBeNull();
    expect(parseInternalNoteHref(`/notes/not-a-uuid`)).toBeNull();
  });

  it("extracts unique note targets from Markdown", () => {
    const content = [
      `[First](/notes/${FIRST})`,
      `[First again](/notes/${FIRST}#details)`,
      `[Second](/notes/${SECOND})`,
      `[External](https://example.com)`,
    ].join("\n");

    expect(extractInternalNoteIds(content)).toEqual([FIRST, SECOND]);
  });
});
