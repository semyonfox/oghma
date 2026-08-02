import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

import sql from "@/database/pgsql.js";
import { validateSession } from "@/lib/auth";
import { GET as getDashboardCourses } from "@/app/api/quiz/dashboard/courses/route";

describe("GET /api/quiz/dashboard/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(sql).mockReset().mockResolvedValue([] as never);
  });

  it("filters archived courses by default", async () => {
    const request = new NextRequest("http://localhost/api/quiz/dashboard/courses");

    const response = await getDashboardCourses(request);

    expect(response.status).toBe(200);
    const query = vi.mocked(sql).mock.calls[0]?.[0]?.join("");
    expect(query).toContain("ucs.is_active IS NULL OR ucs.is_active = true");
  });

  it("includes archived courses when explicitly requested", async () => {
    const request = new NextRequest(
      "http://localhost/api/quiz/dashboard/courses?includeArchived=1",
    );

    const response = await getDashboardCourses(request);

    expect(response.status).toBe(200);
    const query = vi.mocked(sql).mock.calls[0]?.[0]?.join("");
    expect(query).not.toContain("ucs.is_active IS NULL OR ucs.is_active = true");
  });

  it("serializes bigint course IDs as exact decimal strings", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
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
});
