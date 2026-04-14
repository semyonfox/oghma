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
    vi.mocked(sql).mockResolvedValue([] as never);
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
});
