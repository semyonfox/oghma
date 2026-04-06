import { describe, expect, it } from "vitest";
import { resolveNoteRoute } from "@/lib/notes/utils/note-route";

describe("resolveNoteRoute", () => {
  it("ignores non-note paths", () => {
    expect(resolveNoteRoute(null)).toEqual({ type: "ignore" });
    expect(resolveNoteRoute(undefined)).toEqual({ type: "ignore" });
    expect(resolveNoteRoute("/")).toEqual({ type: "ignore" });
    expect(resolveNoteRoute("/calendar")).toEqual({ type: "ignore" });
    expect(resolveNoteRoute("/notes")).toEqual({ type: "ignore" });
    expect(resolveNoteRoute("/notes/")).toEqual({ type: "ignore" });
  });

  it("loads valid UUID note ids", () => {
    const validCases = [
      "123e4567-e89b-12d3-a456-426614174000",
      "123E4567-E89B-12D3-A456-426614174000",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ];

    for (const noteId of validCases) {
      expect(resolveNoteRoute(`/notes/${noteId}`)).toEqual({
        type: "load",
        noteId,
      });
      expect(resolveNoteRoute(`/notes/${noteId}/history`)).toEqual({
        type: "load",
        noteId,
      });
    }
  });

  it("redirects non-UUID note ids to stop useless fetches", () => {
    const invalidCases = [
      "abc123",
      "note_123",
      "123e4567e89b12d3a456426614174000",
      "123e4567-e89b-12d3-a456-42661417400",
      "123e4567-e89b-12d3-a456-4266141740000",
      "123e4567-e89b-12d3-a456-42661417400g",
      "123e4567-e89b-12d3-a456-426614174000-extra",
      "123e4567_e89b_12d3_a456_426614174000",
      "00000000-0000-0000-0000-00000000000",
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
      "---",
      "not-a-uuid-at-all",
    ];

    for (const noteId of invalidCases) {
      expect(resolveNoteRoute(`/notes/${noteId}`)).toEqual({
        type: "redirect",
        noteId,
      });
      expect(resolveNoteRoute(`/notes/${noteId}/anything`)).toEqual({
        type: "redirect",
        noteId,
      });
    }
  });
});
