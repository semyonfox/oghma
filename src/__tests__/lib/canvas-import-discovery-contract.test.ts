import { describe, expect, it } from "vitest";
import { parseJobCourses } from "@/lib/canvas/import-discovery.js";

describe("Canvas import job course contract", () => {
  it("preserves signed-bigint course IDs from serialized jobs", () => {
    expect(
      parseJobCourses({
        course_ids: JSON.stringify(["9007199254740993"]),
      }),
    ).toEqual([
      {
        id: "9007199254740993",
        name: "9007199254740993",
        course_code: "",
        term: null,
      },
    ]);
  });

  it("rejects IDs beyond PostgreSQL's signed-bigint range at job parsing", () => {
    expect(() =>
      parseJobCourses({ course_ids: ["9223372036854775808"] }),
    ).toThrow("supported Canvas ID range");
  });

  it("rejects malformed job course collections", () => {
    expect(() => parseJobCourses({ course_ids: { id: "42" } })).toThrow(
      "course_ids must be an array",
    );
  });
});
