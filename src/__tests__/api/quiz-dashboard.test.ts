import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET as getDashboard } from "@/app/api/quiz/dashboard/route";
import { NextRequest } from "next/server";

describe("GET /api/quiz/dashboard", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
      email: "student@example.com",
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
