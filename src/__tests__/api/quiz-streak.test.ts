import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/quiz/streak", () => ({
  advanceQuizStreak: vi.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/quiz/streak/route";
import { validateSession } from "@/lib/auth";
import { advanceQuizStreak } from "@/lib/quiz/streak";

const request = new NextRequest("http://localhost/api/quiz/streak", {
  method: "POST",
});

beforeEach(() => {
  vi.clearAllMocks();
  (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user_id: "user-1",
    email: "test@example.com",
  });
});

describe("POST /api/quiz/streak", () => {
  it("preserves the public response while delegating streak advancement", async () => {
    (advanceQuizStreak as ReturnType<typeof vi.fn>).mockResolvedValue({
      advanced: true,
      current_streak: 7,
      newMilestone: 7,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      current_streak: 7,
      newMilestone: 7,
    });
    expect(advanceQuizStreak).toHaveBeenCalledWith("user-1");
  });

  it("does not call the service for an unauthenticated request", async () => {
    (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(advanceQuizStreak).not.toHaveBeenCalled();
  });
});
