import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

import sql from "@/database/pgsql";
import { validateSession, type SessionUser } from "@/lib/auth";
import { GET as getDashboardCourses } from "@/app/api/quiz/dashboard/courses/route";

describe("GET /api/quiz/dashboard/courses", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
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

  it("serializes bigint course IDs as exact decimal strings", async () => {
    vi.mocked(sql).mockResolvedValue([
      {
        canvas_course_id: "9007199254740993",
        course_name: "Big ID course",
        total_cards: 1,
        due_count: 1,
        mastered_count: 0,
        is_active: true,
      },
    ] as never);

    const response = await getDashboardCourses(
      new NextRequest("http://localhost/api/quiz/dashboard/courses"),
    );
    expect((await response.json()).courses[0].courseId).toBe(
      "9007199254740993",
    );
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
