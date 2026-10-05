import { describe, expect, it } from "vitest";
import { chooseSyllabus, syllabusScore } from "@/lib/study-map/syllabus";

const note = (title: string) => ({ noteId: title, title });

describe("study map syllabus detection", () => {
  it("recognises common module outline titles and ignores lecture notes", () => {
    expect(syllabusScore("CT216 Syllabus.pdf")).toBeGreaterThan(0);
    expect(syllabusScore("Module_Descriptor 2025")).toBeGreaterThan(0);
    expect(syllabusScore("Course outline")).toBeGreaterThan(0);
    expect(syllabusScore("Learning outcomes")).toBeGreaterThan(0);
    expect(syllabusScore("Week 3 - Process scheduling")).toBe(0);
    expect(syllabusScore("Module 4 lecture")).toBe(0);
  });

  it("prefers an explicit syllabus, then the shortest equally strong title", () => {
    expect(
      chooseSyllabus([
        note("Course outline"),
        note("Week 1 syllabus recap"),
        note("Syllabus"),
      ])?.title,
    ).toBe("Syllabus");
    expect(chooseSyllabus([note("Lecture 1"), note("Lab 2")])).toBeNull();
  });
});
