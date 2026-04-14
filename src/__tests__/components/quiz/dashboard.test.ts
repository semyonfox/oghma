// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const setDashboard = vi.fn();
  const setCourses = vi.fn();
  const setDashboardLoading = vi.fn();
  const startSession = vi.fn();
  const archiveCourse = vi.fn().mockResolvedValue(undefined);
  const unarchiveCourse = vi.fn().mockResolvedValue(undefined);
  const fetchSettings = vi.fn().mockResolvedValue(undefined);
  const toggleShowArchived = vi.fn();
  let showArchived = false;
  const quizStoreState = {
    dashboardData: {
      dueCount: 2,
      totalCards: 5,
      mastery: 40,
      reviewedToday: 1,
      weekAccuracy: 50,
      currentStreak: 3,
      longestStreak: 4,
      hasContent: true,
    },
    courses: [],
    dashboardLoading: false,
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
  };

  return {
    setDashboard,
    setCourses,
    setDashboardLoading,
    startSession,
    archiveCourse,
    unarchiveCourse,
    fetchSettings,
    toggleShowArchived,
    settings: [],
    get showArchived() {
      return showArchived;
    },
    set showArchived(value: boolean) {
      showArchived = value;
    },
    quizStoreState,
    lastCourseListProps: null as any,
    lastManagerProps: null as any,
  };
});

vi.mock("@/lib/notes/state/quiz", () => ({
  default: Object.assign(() => mocks.quizStoreState, {
    getState: () => mocks.quizStoreState,
  }),
}));

vi.mock("@/lib/notes/state/courses.zustand", () => ({
  default: () => ({
    settings: mocks.settings,
    showArchived: mocks.showArchived,
    fetchSettings: mocks.fetchSettings,
    toggleShowArchived: mocks.toggleShowArchived,
    archiveCourse: mocks.archiveCourse,
    unarchiveCourse: mocks.unarchiveCourse,
  }),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/quiz/stats-row", () => ({
  default: () => null,
}));

vi.mock("@/components/quiz/course-list", () => ({
  default: (props: any) => {
    mocks.lastCourseListProps = props;
    return React.createElement("div");
  },
}));

vi.mock("@/components/course-visibility/manager", () => ({
  CourseVisibilityDialog: (props: any) => {
    mocks.lastManagerProps = props;
    return React.createElement("div");
  },
  mergeCourseVisibilityItems: (items: any) => items,
}));

import QuizDashboard from "@/components/quiz/dashboard";

function okJson(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function renderDashboard() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(QuizDashboard));
  });

  return { container, root };
}

describe("QuizDashboard archive refresh", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    mocks.showArchived = false;
    mocks.lastCourseListProps = null;
    mocks.lastManagerProps = null;
  });

  it("refetches server-backed quiz data after archiving a course", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ dueCount: 2, totalCards: 5, mastery: 40, reviewedToday: 1, weekAccuracy: 50, currentStreak: 3, longestStreak: 4, hasContent: true }))
      .mockResolvedValueOnce(okJson({ courses: [{ courseId: 42, courseName: "Course A", totalCards: 3, dueCount: 1, mastery: 33, isActive: true }] }))
      .mockResolvedValueOnce(okJson({ dueCount: 1, totalCards: 2, mastery: 50, reviewedToday: 1, weekAccuracy: 50, currentStreak: 3, longestStreak: 4, hasContent: true }))
      .mockResolvedValueOnce(okJson({ courses: [{ courseId: 42, courseName: "Course A", totalCards: 3, dueCount: 1, mastery: 33, isActive: false }] }));
    vi.stubGlobal("fetch", fetchMock);

    await renderDashboard();

    await act(async () => {
      await mocks.lastManagerProps.onToggleCourse(
        { courseId: 42, courseName: "Course A", isActive: true },
        false,
      );
    });

    expect(mocks.archiveCourse).toHaveBeenCalledWith(42, "Course A");
    expect(mocks.fetchSettings).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/quiz/dashboard");
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/quiz/dashboard/courses");
    expect(mocks.setCourses).toHaveBeenLastCalledWith([
      {
        courseId: 42,
        courseName: "Course A",
        totalCards: 3,
        dueCount: 1,
        mastery: 33,
        isActive: false,
      },
    ]);
  });

  it("requests archived quiz courses from the server when the toggle is enabled", async () => {
    mocks.showArchived = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ dueCount: 2, totalCards: 5, mastery: 40, reviewedToday: 1, weekAccuracy: 50, currentStreak: 3, longestStreak: 4, hasContent: true }))
      .mockResolvedValueOnce(okJson({ courses: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await renderDashboard();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/quiz/dashboard");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/quiz/dashboard/courses?includeArchived=1");
  });
});
