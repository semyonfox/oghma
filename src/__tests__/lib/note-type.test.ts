import { describe, expect, it } from "vitest";
import { isNoteLink, NOTE_ID_REGEXP } from "@/lib/notes/types/note";

describe("NOTE_ID_REGEXP", () => {
  it("is a UUID v7 pattern (third group starts with 7)", () => {
    const re = new RegExp(`^${NOTE_ID_REGEXP}$`);

    // valid v7 UUIDs (third group begins with 7)
    expect(re.test("01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d")).toBe(true);
    expect(re.test("ffffffff-ffff-7fff-8fff-ffffffffffff")).toBe(true);

    // v4 UUID (third group begins with 4) — should not match
    expect(re.test("123e4567-e89b-42d3-a456-426614174000")).toBe(false);

    // too short / malformed
    expect(re.test("not-a-uuid")).toBe(false);
    expect(re.test("")).toBe(false);
  });
});

describe("isNoteLink", () => {
  it("accepts a valid v7 note path", () => {
    expect(isNoteLink("/01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d")).toBe(true);
  });

  it("rejects a path without a leading slash", () => {
    expect(isNoteLink("01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d")).toBe(false);
  });

  it("rejects a path with trailing segments", () => {
    expect(isNoteLink("/01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d/history")).toBe(
      false,
    );
  });

  it("rejects plain strings", () => {
    expect(isNoteLink("/notes")).toBe(false);
    expect(isNoteLink("/")).toBe(false);
    expect(isNoteLink("")).toBe(false);
  });

  it("rejects v4 UUIDs (wrong version nibble)", () => {
    expect(isNoteLink("/123e4567-e89b-42d3-a456-426614174000")).toBe(false);
  });
});
