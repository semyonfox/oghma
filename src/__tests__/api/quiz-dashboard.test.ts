import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET as getDashboard } from "@/app/api/quiz/dashboard/route";

describe("GET /api/quiz/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({ user_id: "user-123" } as never);
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

  it("filters archived courses in aggregate card and review queries", async () => {
    const response = await getDashboard();

    expect(response.status).toBe(200);

    const aggregateQuery = vi.mocked(sql).mock.calls[0]?.[0]?.join("");
    const reviewQuery = vi.mocked(sql).mock.calls[1]?.[0]?.join("");

    expect(aggregateQuery).toContain("LEFT JOIN app.user_course_settings ucs");
    expect(aggregateQuery).toContain("n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true");
    expect(reviewQuery).toContain("LEFT JOIN app.user_course_settings ucs");
    expect(reviewQuery).toContain("n.canvas_course_id IS NULL OR ucs.is_active IS NULL OR ucs.is_active = true");
  });
});
