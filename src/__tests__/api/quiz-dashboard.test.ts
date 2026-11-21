import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth/session", () => ({
  validateSession: vi.fn(),
}));

import sql from "@/database/pgsql";
import { validateSession, type SessionUser } from "@/lib/auth/session";
import { GET as getDashboard } from "@/app/api/quiz/dashboard/route";
import { GET as getDashboardCourses } from "@/app/api/quiz/dashboard/courses/route";
import { NextRequest } from "next/server";

describe("GET /api/quiz/dashboard", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
      session_version: 0, email: "student@example.com",
    } satisfies SessionUser);
    vi.mocked(sql)
      .mockResolvedValueOnce([
        { due_count: 3, total_cards: 8, mastered_count: 5 },
      ] as never)
      .mockResolvedValueOnce([
        { reviewed_today: 2, week_total: 4, week_correct: 3 },
      ] as never)
      .mockResolvedValueOnce([{ current_streak: 1, longest_streak: 2 }] as never)
      .mockResolvedValueOnce([{ has_content: true }] as never);
  });

  it("returns dashboard metrics derived from the visible-card aggregates", async () => {
    const response = await getDashboard(
      new NextRequest("http://localhost/api/quiz/dashboard"),
    );

    const countsQuery = vi.mocked(sql).mock.calls[0][0].join("");
    expect(countsQuery).toContain("n.note_id = qq.note_id");
    expect(countsQuery).not.toContain("JOIN app.chunks");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      dueCount: 3,
      totalCards: 8,
      mastery: 63,
      reviewedToday: 2,
      weekAccuracy: 75,
      currentStreak: 1,
      longestStreak: 2,
      hasContent: true,
    });
  });

  it("does not read quiz data without a session", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await getDashboard(
      new NextRequest("http://localhost/api/quiz/dashboard"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("GET /api/quiz/dashboard/courses", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
      session_version: 0,
      email: "student@example.com",
    } satisfies SessionUser);
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("preserves the selected course order and maps quiz metrics for the client", async () => {
    vi.mocked(sql).mockResolvedValue([
      {
        canvas_course_id: "9007199254740993",
        course_name: "Algorithms",
        total_cards: 8,
        due_count: 3,
        mastered_count: 5,
        is_active: true,
      },
      {
        canvas_course_id: 42,
        course_name: null,
        total_cards: 0,
        due_count: 0,
        mastered_count: 0,
        is_active: false,
      },
    ] as never);

    const response = await getDashboardCourses(
      new NextRequest("http://localhost/api/quiz/dashboard/courses"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      courses: [
        {
          courseId: "9007199254740993",
          courseName: "Algorithms",
          totalCards: 8,
          dueCount: 3,
          mastery: 63,
          isActive: true,
        },
        {
          courseId: "42",
          courseName: null,
          totalCards: 0,
          dueCount: 0,
          mastery: 0,
          isActive: false,
        },
      ],
    });
  });

  it("does not select courses without a session", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await getDashboardCourses(
      new NextRequest("http://localhost/api/quiz/dashboard/courses"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Unauthorized" });
    expect(sql).not.toHaveBeenCalled();
  });
});
