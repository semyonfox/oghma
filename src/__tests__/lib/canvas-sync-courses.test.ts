import { describe, expect, it } from "vitest";
import {
  buildCanvasSyncCourses,
  resolveAccessibleCanvasCourses,
} from "@/lib/canvas/sync-courses.js";

describe("Canvas resync course contract", () => {
  it("keeps a missing 64-bit course ID exact in the fallback job payload", () => {
    expect(
      buildCanvasSyncCourses(new Set(["9007199254740993"]), []),
    ).toEqual([
      {
        id: "9007199254740993",
        name: "9007199254740993",
        course_code: "",
        term: null,
      },
    ]);
  });

  it("normalizes matched Canvas courses and appends missing courses", () => {
    expect(
      buildCanvasSyncCourses(
        new Set(["9007199254740993", "42"]),
        [
          {
            id: "42",
            name: "Software Engineering",
            course_code: "CT216",
          },
          { id: "7", name: "Unselected" },
        ],
      ),
    ).toEqual([
      {
        id: "42",
        name: "Software Engineering",
        course_code: "CT216",
        term: null,
      },
      {
        id: "9007199254740993",
        name: "9007199254740993",
        course_code: "",
        term: null,
      },
    ]);
  });

  it("rejects prior IDs outside the database range", () => {
    expect(() =>
      buildCanvasSyncCourses(new Set(["9223372036854775808"]), []),
    ).toThrow("supported Canvas ID range");
  });

  it("adds a directly accessible historical course missing from Canvas's list", async () => {
    const client = {
      getCourse: async (id: string) => ({
        data: {
          id,
          name: "Archived Algorithms",
          course_code: "CT216",
        },
      }),
    };

    await expect(
      resolveAccessibleCanvasCourses(
        client,
        [{ id: "42", name: "Current" }],
        ["42", "9007199254740993"],
      ),
    ).resolves.toEqual([
      { id: "42", name: "Current" },
      {
        id: "9007199254740993",
        name: "Archived Algorithms",
        course_code: "CT216",
        historical: true,
      },
    ]);
  });

  it("omits a historical course Canvas no longer allows the user to open", async () => {
    await expect(
      resolveAccessibleCanvasCourses(
        { getCourse: async () => ({ data: null, forbidden: true }) },
        [],
        ["42"],
      ),
    ).resolves.toEqual([]);
  });
});
