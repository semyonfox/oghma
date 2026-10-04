import { describe, expect, it } from "vitest";
import {
  groupCourseVisibilityItems,
  mergeCourseVisibilityItems,
  type CourseVisibilityItemSource,
} from "@/components/course-visibility/course-visibility-manager";
import type { CourseSetting } from "@/lib/notes/state/courses.zustand";

const settings: CourseSetting[] = [
  {
    id: "setting-1",
    canvasCourseId: "7",
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
        courseId: "5",
        courseName: "Biology",
        isActive: true,
        contextText: "2 due · 9 cards",
        hasDueItems: true,
      },
      {
        courseId: "7",
        courseName: "Archived Algebra",
        isActive: true,
        contextText: "0 due · 14 cards",
        hasDueItems: false,
      },
    ];

    expect(mergeCourseVisibilityItems(sources, settings)).toEqual([
      {
        courseId: "7",
        courseName: "Archived Algebra",
        isActive: false,
        contextText: "0 due · 14 cards",
        hasDueItems: false,
      },
      {
        courseId: "5",
        courseName: "Biology",
        isActive: true,
        contextText: "2 due · 9 cards",
        hasDueItems: true,
      },
    ]);
  });

  it.each([null, "", "   ", "7", "Course 7"])(
    "keeps the saved archived name when the source name is %j",
    (courseName) => {
      const items = mergeCourseVisibilityItems(
        [{ courseId: "7", courseName, isActive: true }],
        settings,
      );

      expect(items[0]).toMatchObject({
        courseId: "7",
        courseName: "Archived Algebra",
        isActive: false,
      });
      expect(groupCourseVisibilityItems(items, "algebra").archived).toHaveLength(1);
    },
  );

  it("uses an updated course name while keeping its archived state", () => {
    expect(mergeCourseVisibilityItems(
      [{ courseId: "7", courseName: "Advanced Algebra" }],
      settings,
    )[0]).toMatchObject({ courseName: "Advanced Algebra", isActive: false });
  });

  it("keeps unnamed courses visible and searchable without rounding their IDs", () => {
    const courseId = "9007199254740993";
    const items = mergeCourseVisibilityItems([{ courseId, courseName: null }], []);

    expect(items[0]).toMatchObject({ courseId, courseName: `Course ${courseId}` });
    expect(groupCourseVisibilityItems(items, courseId).active).toHaveLength(1);
  });

  it("groups active and archived courses alphabetically after filtering", () => {
    const grouped = groupCourseVisibilityItems(
      [
        { courseId: "3", courseName: "Zoology", isActive: true },
        { courseId: "1", courseName: "Calculus", isActive: false },
        { courseId: "2", courseName: "Algorithms", isActive: true },
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
