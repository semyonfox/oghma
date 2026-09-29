import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("@/database/pgsql", () => ({ default: vi.fn().mockResolvedValue([]) }));
import sql from "@/database/pgsql";
import {
  deriveAssignmentType,
  shouldSyncAssignment,
  syncAssignmentMetadata,
} from "@/lib/canvas/sync-assignments";

describe("syncAssignmentMetadata", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset().mockResolvedValue([]);
  });

  it("reuses assignments fetched during discovery", async () => {
    const client = { getAssignments: vi.fn() };
    const result = await syncAssignmentMetadata("42", "11111111-1111-4111-8111-111111111111", "Course", client, [
      { id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z" },
    ]);

    expect(result).toEqual({ synced: 1, errors: 0 });
    expect(client.getAssignments).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("bounds database writes while syncing independent assignments", async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(sql).mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return [] as never;
    });
    const assignments = Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1), name: `Assignment ${index + 1}`, due_at: "2026-10-01T10:00:00Z",
    }));
    const result = await syncAssignmentMetadata("42", "11111111-1111-4111-8111-111111111111", "Course", { getAssignments: vi.fn() }, assignments);

    expect(result).toEqual({ synced: 8, errors: 0 });
    expect(peak).toBe(4);
  });
});

describe("shouldSyncAssignment", () => {
  it("skips unpublished assignments", () => {
    expect(
      shouldSyncAssignment({
        published: false,
        due_at: "2026-03-01T10:00:00Z",
      }),
    ).toBe(false);
  });

  it("skips locked assignments", () => {
    expect(
      shouldSyncAssignment({
        published: true,
        locked_for_user: true,
        due_at: "2026-03-01T10:00:00Z",
      }),
    ).toBe(false);
  });

  it("skips undated and unsubmitted assignments", () => {
    expect(
      shouldSyncAssignment({
        published: true,
        due_at: null,
        submission: { workflow_state: "unsubmitted" },
      }),
    ).toBe(false);
  });

  it("keeps submitted assignments even without due date", () => {
    expect(
      shouldSyncAssignment({
        published: true,
        due_at: null,
        submission: { submitted_at: "2026-03-01T10:00:00Z" },
      }),
    ).toBe(true);
  });

  it("keeps dated assignments", () => {
    expect(shouldSyncAssignment({ published: true, due_at: "2026-03-01T10:00:00Z" })).toBe(true);
  });
});

describe("deriveAssignmentType", () => {
  it("marks Canvas quiz assignments from structured quiz flags", () => {
    expect(deriveAssignmentType({ is_quiz_assignment: true })).toBe("quiz");
  });

  it("marks Canvas quiz assignments from quiz submission types", () => {
    expect(deriveAssignmentType({ submission_types: ["online_quiz"] })).toBe("quiz");
    expect(deriveAssignmentType({ submission_types: ["quiz"] })).toBe("quiz");
  });

  it("marks normal Canvas assignments as assignment", () => {
    expect(deriveAssignmentType({ submission_types: ["online_upload"] })).toBe("assignment");
  });

  it("falls back to unknown when Canvas does not expose enough signal", () => {
    expect(deriveAssignmentType({})).toBe("unknown");
    expect(deriveAssignmentType(null)).toBe("unknown");
  });
});
