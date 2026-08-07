import { describe, expect, it } from "vitest";
import {
  cleanCourseName,
  stripHtmlToText,
} from "@/lib/canvas/content-formatting.js";

describe("Canvas content formatting", () => {
  it.each([
    ["2526-CT2109", "2526-CT2109 Software Engineering 1", undefined, { title: "CT2109-Software-Engineering-1", academicYear: "2526" }],
    ["CT2109", "CT2109: Software Engineering", { name: "2025/2026" }, { title: "CT2109-Software-Engineering", academicYear: "2526" }],
    [undefined, undefined, { name: "2025-26" }, { title: "Untitled-Course", academicYear: "2526" }],
  ])("formats course names and academic years", (courseCode, courseName, term, expected) => {
    expect(cleanCourseName(courseCode, courseName, term)).toEqual(expected);
  });

  it("converts Canvas HTML into the existing text format", () => {
    expect(stripHtmlToText("<h1>Week &amp; one</h1><p>Read<br>this</p><ul><li>First</li><li>Second</li></ul>")).toBe(
      "## Week & one\n\nRead\nthis\n\n- First\n- Second",
    );
  });
});
