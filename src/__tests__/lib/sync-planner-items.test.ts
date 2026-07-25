import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));

import sql from "@/database/pgsql.js";
import { syncCanvasPlannerItems } from "@/lib/canvas/sync-planner-items.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
function makeClient(result: any) { return { getPlannerItems: vi.fn().mockResolvedValue(result) }; }

describe("syncCanvasPlannerItems", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(sql).mockResolvedValue([] as never); });

  it("upserts normalized planner items and tombstones missing rows after a complete sync", async () => {
    const client = makeClient({ data: [{ plannable_type: "discussion_topic", plannable_id: 99, plannable: { id: 99, title: "Discussion", todo_date: "2026-02-01T10:00:00Z" } }], forbidden: false });
    const result = await syncCanvasPlannerItems({ userId: USER_ID, canvasDomain: "canvas.example", canvasUserId: 7, client, startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z" });
    expect(result).toEqual({ synced: 1, tombstoned: 0, errors: 0, partial: false });
    expect(client.getPlannerItems).toHaveBeenCalledWith("2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z");
    expect(vi.mocked(sql).mock.calls.length).toBe(2);
    expect(String.raw({ raw: vi.mocked(sql).mock.calls[1][0] as any })).toContain("UPDATE app.canvas_planner_items");
    expect(String.raw({ raw: vi.mocked(sql).mock.calls[1][0] as any })).toContain("deleted_at = NOW()");
  });

  it("does not tombstone rows when Canvas returns a partial failure", async () => {
    const client = makeClient({ data: [], forbidden: false, error: "Canvas API rate limited — try again later" });
    const result = await syncCanvasPlannerItems({ userId: USER_ID, canvasDomain: "canvas.example", client, startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z" });
    expect(result).toEqual({ synced: 0, tombstoned: 0, errors: 1, partial: true });
    expect(vi.mocked(sql)).not.toHaveBeenCalled();
  });
});
