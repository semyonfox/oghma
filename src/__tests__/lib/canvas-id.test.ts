import { describe, expect, it } from "vitest";
import {
  canvasIdForBigintColumn,
  canvasIdString,
  canvasModuleIdForBigintColumn,
  normalizeCanvasCourseSelection,
} from "@/lib/canvas/id";

describe("Canvas ID normalization", () => {
  it("preserves decimal-string IDs exactly", () => {
    expect(canvasIdString("9007199254740993")).toBe("9007199254740993");
  });

  it("rejects unsafe numeric IDs instead of rounding them", () => {
    expect(() => canvasIdString(9007199254740992)).toThrow("safe integer");
  });

  it("preserves safe bigint strings and rejects values PostgreSQL cannot store", () => {
    expect(canvasIdForBigintColumn("9007199254740993")).toBe(
      "9007199254740993",
    );
    expect(() =>
      canvasIdForBigintColumn("9223372036854775808"),
    ).toThrow("supported Canvas ID range");
  });

  it("permits only the internal -1 module sentinel", () => {
    expect(canvasModuleIdForBigintColumn(-1)).toBe("-1");
    expect(() => canvasIdForBigintColumn(-1, "Canvas module ID")).toThrow(
      "non-negative",
    );
  });

  it("normalizes persisted course metadata without rounding IDs", () => {
    expect(
      normalizeCanvasCourseSelection({
        id: "9007199254740993",
        name: "Software Engineering",
        course_code: "CT216",
        term: { id: "9007199254740995", name: "2026/2027" },
        ignored: "not persisted",
      }),
    ).toEqual({
      id: "9007199254740993",
      name: "Software Engineering",
      course_code: "CT216",
      term: { id: "9007199254740995", name: "2026/2027" },
    });
  });

  it("keeps a bare fallback course ID as a string", () => {
    expect(normalizeCanvasCourseSelection("9007199254740993")).toEqual({
      id: "9007199254740993",
      name: "9007199254740993",
      course_code: "",
      term: null,
    });
  });

  it("rejects invalid course metadata before it reaches a worker", () => {
    expect(() =>
      normalizeCanvasCourseSelection({ id: "42", name: 42 }),
    ).toThrow("Canvas course name must be a string");
  });
});
