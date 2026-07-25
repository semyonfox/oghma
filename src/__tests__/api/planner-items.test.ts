import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => { const sqlMock = vi.fn(); sqlMock.mockResolvedValue([]); return { default: sqlMock }; });
vi.mock("@/lib/api-error", () => ({ requireAuth: vi.fn(), withErrorHandler: (handler: any) => handler }));

import sql from "@/database/pgsql.js";
import { requireAuth } from "@/lib/api-error";
import { GET } from "@/app/api/planner/items/route";

describe("GET /api/planner/items", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never); });

  it("returns normalized planner rows without raw Canvas JSON", async () => {
    vi.mocked(sql).mockResolvedValue([{ id: "item-1", source: "canvas", plannable_type: "announcement", plannable_id: "99", canvas_course_id: 42, course_name: "CS101", title: "Exam notice", body: "Read this", html_url: "https://canvas.example/announcements/99", display_at: "2026-02-01T10:00:00.000Z", due_at: null, date_source: "posted_at", item_state: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", raw_planner_item: { should: "not leak" }, raw_plannable: { should: "not leak" } }] as never);
    const response = await GET(new NextRequest("http://localhost/api/planner/items?start=2026-01-01T00:00:00.000Z&end=2026-03-01T00:00:00.000Z"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "item-1", source: "canvas", plannable_type: "announcement", plannable_id: "99", canvas_course_id: 42, course_name: "CS101", title: "Exam notice", body: "Read this", html_url: "https://canvas.example/announcements/99", display_at: "2026-02-01T10:00:00.000Z", due_at: null, date_source: "posted_at", item_state: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }]);
    expect(JSON.stringify(body)).not.toContain("raw_planner_item");
    expect(JSON.stringify(body)).not.toContain("raw_plannable");
  });
});
