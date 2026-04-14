import { describe, expect, it } from "vitest";
import {
  groupCourseVisibilityItems,
  mergeCourseVisibilityItems,
  type CourseVisibilityItemSource,
} from "@/components/course-visibility/manager";
import type { CourseSetting } from "@/lib/notes/state/courses.zustand";

const settings: CourseSetting[] = [
  {
    id: "setting-1",
    canvasCourseId: 7,
    courseName: "Archived Algebra",
    isActive: false,
    autoArchived: false,
    archivedAt: "2026-04-01T12:00:00.000Z",
  },
];

describe("course visibility helpers", () => {
  it("merges source courses with stored settings using settings as the visibility source of truth", () => {
    const sources: CourseVisibilityItemSource[] = [
      {
        courseId: 5,
        courseName: "Biology",
        isActive: true,
        contextText: "2 due · 9 cards",
        hasDueItems: true,
      },
      {
        courseId: 7,
        courseName: "Archived Algebra",
        isActive: true,
        contextText: "0 due · 14 cards",
        hasDueItems: false,
      },
    ];

    expect(mergeCourseVisibilityItems(sources, settings)).toEqual([
      {
        courseId: 7,
        courseName: "Archived Algebra",
        isActive: false,
        contextText: "0 due · 14 cards",
        hasDueItems: false,
      },
      {
        courseId: 5,
        courseName: "Biology",
        isActive: true,
        contextText: "2 due · 9 cards",
        hasDueItems: true,
      },
    ]);
  });

  it("groups active and archived courses alphabetically after filtering", () => {
    const grouped = groupCourseVisibilityItems(
      [
        { courseId: 3, courseName: "Zoology", isActive: true },
        { courseId: 1, courseName: "Calculus", isActive: false },
        { courseId: 2, courseName: "Algorithms", isActive: true },
      ],
      "l",
    );

    expect(grouped.active.map((item) => item.courseName)).toEqual([
      "Algorithms",
      "Zoology",
    ]);
    expect(grouped.archived.map((item) => item.courseName)).toEqual([
      "Calculus",
    ]);
  });
});
