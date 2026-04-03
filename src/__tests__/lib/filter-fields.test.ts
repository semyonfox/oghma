import { describe, expect, it } from "vitest";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";

describe("filterNoteFields", () => {
  const note = {
    id: "abc",
    title: "My Note",
    content: "Hello",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    isFolder: false,
  };

  it("returns the full object when fields list is omitted", () => {
    expect(filterNoteFields(note)).toStrictEqual(note);
  });

  it("returns the full object when fields list is empty", () => {
    expect(filterNoteFields(note, [])).toStrictEqual(note);
  });

  it("picks only the requested fields", () => {
    const result = filterNoteFields(note, ["id", "title"]);
    expect(result).toStrictEqual({ id: "abc", title: "My Note" });
  });

  it("ignores unknown field names silently", () => {
    const result = filterNoteFields(note, ["id", "nonexistent"]);
    expect(result).toStrictEqual({ id: "abc" });
  });

  it("picks a single field", () => {
    const result = filterNoteFields(note, ["content"]);
    expect(result).toStrictEqual({ content: "Hello" });
  });

  it("handles an object with all falsy values", () => {
    const falsy = { a: 0, b: false, c: "", d: null };
    const result = filterNoteFields(falsy, ["a", "b"]);
    expect(result).toStrictEqual({ a: 0, b: false });
  });
});
