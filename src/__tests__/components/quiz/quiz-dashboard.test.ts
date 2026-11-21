// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/quiz/exam-strip", () => ({ default: () => null }));

const mocks = vi.hoisted(() => {
  const startSession = vi.fn();
  const archiveCourse = vi.fn().mockResolvedValue(undefined);
  const unarchiveCourse = vi.fn().mockResolvedValue(undefined);
  const fetchSettings = vi.fn().mockResolvedValue(undefined);
  const toggleShowArchived = vi.fn();
  let showArchived = false;
  let timeZone = "UTC";
  const quizStoreState = {
    startSession,
  };

  return {
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
    get timeZone() {
      return timeZone;
    },
    set timeZone(value: string) {
      timeZone = value;
    },
    quizStoreState,
  };
});

vi.mock("@/lib/quiz/time-zone", () => ({
  DEFAULT_TIME_ZONE: "UTC",
  browserTimeZone: () => mocks.timeZone,
}));

vi.mock("@/lib/notes/state/quiz", () => ({
  default: Object.assign(() => mocks.quizStoreState, {
    getState: () => mocks.quizStoreState,
  }),
}));

vi.mock("@/lib/notes/state/courses", () => ({
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

import QuizDashboard from "@/components/quiz/quiz-dashboard";

const initialDashboard = {
  dueCount: 2,
  totalCards: 5,
  mastery: 40,
  reviewedToday: 1,
  weekAccuracy: 50,
  currentStreak: 3,
  longestStreak: 4,
  hasContent: true,
};

const initialCourses = [
  {
    courseId: "42",
    courseName: "Course A",
    totalCards: 3,
    dueCount: 1,
    mastery: 33,
    isActive: true,
  },
];

function okJson(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

function renderDashboard() {
  return render(React.createElement(QuizDashboard, {
    initialDashboard,
    initialCourses,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("QuizDashboard archive refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.showArchived = false;
    mocks.timeZone = "UTC";
  });

  it("refetches server-backed quiz data after archiving a course", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      if (path === "/api/quiz/dashboard?tz=UTC") {
        return Response.json({ ...initialDashboard, reviewedToday: 4 });
      }
      if (path === "/api/quiz/dashboard/courses") {
        return Response.json({ courses: [{ ...initialCourses[0], isActive: false }] });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));
    renderDashboard();
    expect(screen.getByText("Course A")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    const manager = screen.getByRole("dialog");
    fireEvent.click(within(manager).getByRole("button", { name: "Active" }));
    await within(manager).findByRole("button", { name: "Archived" });
    expect(mocks.archiveCourse).toHaveBeenCalledWith("42", "Course A");

    fireEvent.click(within(manager).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Course A")).toBeNull();
    expect(screen.getByText("quiz.stats.reviewed_today").parentElement?.textContent).toContain("4");
  });

  it("requests archived quiz courses from the server when the toggle is enabled", async () => {
    mocks.showArchived = true;
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      if (path === "/api/quiz/dashboard?tz=UTC") return Response.json(initialDashboard);
      if (path === "/api/quiz/dashboard/courses?includeArchived=1") {
        return Response.json({
          courses: [{ ...initialCourses[0], courseName: "Archived course", isActive: false }],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    renderDashboard();

    expect(await screen.findByText("Archived course")).toBeTruthy();
  });

  it("renders server-provided dashboard data without an initial browser fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    expect(screen.getByText("Course A")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recounts today's reviews in the browser's zone after a UTC server render", async () => {
    mocks.timeZone = "America/New_York";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ ...initialDashboard, reviewedToday: 4 }));
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    await waitFor(() => expect(screen.getByText("quiz.stats.reviewed_today").parentElement?.textContent).toContain("4"));
    expect(fetchMock).toHaveBeenCalledWith("/api/quiz/dashboard?tz=America%2FNew_York");
  });
});
