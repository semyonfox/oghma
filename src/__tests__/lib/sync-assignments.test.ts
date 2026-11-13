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

    expect(result).toEqual({ synced: 1, errors: 0, removed: 0 });
    expect(client.getAssignments).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledOnce();
  });

  it("keeps the lecturer's brief only while content import is on", async () => {
    const assignment = { id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z", description: "<p>Write 2000 words</p>" };
    const client = { getAssignments: vi.fn() };
    const values = () => vi.mocked(sql).mock.calls[0].slice(1);

    await syncAssignmentMetadata("42", "11111111-1111-4111-8111-111111111111", "Course", client, [assignment]);
    expect(values()).toContain("Essay");
    expect(values()).not.toContain("<p>Write 2000 words</p>");

    vi.mocked(sql).mockClear();
    vi.stubEnv("CANVAS_CONTENT_IMPORT", "on");
    try {
      await syncAssignmentMetadata("42", "11111111-1111-4111-8111-111111111111", "Course", client, [assignment]);
      expect(values()).toContain("<p>Write 2000 words</p>");
    } finally {
      vi.unstubAllEnvs();
    }
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

    expect(result).toEqual({ synced: 8, errors: 0, removed: 0 });
    expect(peak).toBe(4);
  });
});

describe("syncAssignmentMetadata Canvas deletions", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const sqlText = (call: unknown[]) => (call[0] as string[]).join("?");

  beforeEach(() => {
    vi.mocked(sql).mockReset().mockResolvedValue([]);
  });

  it("removes rows Canvas no longer lists after a complete fetch", async () => {
    vi.mocked(sql).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "gone" }] as never);
    const client = {
      getAssignments: vi.fn().mockResolvedValue({
        data: [
          { id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z" },
          // locked rows are listed, so they must never be pruned
          { id: "8", name: "Locked", due_at: "2026-10-01T10:00:00Z", locked_for_user: true },
        ],
        forbidden: false,
      }),
    };

    const result = await syncAssignmentMetadata("42", userId, "Course", client);

    expect(result).toEqual({ synced: 1, errors: 0, removed: 1 });
    const deleteCall = vi.mocked(sql).mock.calls.find((call) => sqlText(call).includes("DELETE FROM app.assignments"));
    expect(deleteCall).toBeDefined();
    expect(deleteCall).toContain(userId);
    expect(deleteCall).toContain("42");
    expect(deleteCall).toContainEqual(["7", "8"]);
  });

  it("never prunes from a partial or restricted Canvas read", async () => {
    const client = {
      getAssignments: vi.fn().mockResolvedValue({
        data: [{ id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z" }],
        forbidden: false,
        error: "Canvas API error: 500",
      }),
    };

    expect(await syncAssignmentMetadata("42", userId, "Course", client)).toEqual({ synced: 0, errors: 1, removed: 0 });
    expect(sql).not.toHaveBeenCalled();

    client.getAssignments.mockResolvedValue({ data: [], forbidden: true, error: "Access restricted by lecturer" });
    expect(await syncAssignmentMetadata("42", userId, "Course", client)).toEqual({ synced: 0, errors: 1, removed: 0 });
    expect(sql).not.toHaveBeenCalled();
  });

  it("only prunes from discovery's list when the caller vouches it is complete", async () => {
    const known = [{ id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z" }];
    const client = { getAssignments: vi.fn() };

    await syncAssignmentMetadata("42", userId, "Course", client, known);
    expect(vi.mocked(sql).mock.calls.some((call) => sqlText(call).includes("DELETE"))).toBe(false);

    await syncAssignmentMetadata("42", userId, "Course", client, known, { complete: true });
    expect(vi.mocked(sql).mock.calls.some((call) => sqlText(call).includes("DELETE"))).toBe(true);
  });

  it("skips pruning when any upsert failed", async () => {
    vi.mocked(sql).mockRejectedValueOnce(new Error("write failed"));
    const client = {
      getAssignments: vi.fn().mockResolvedValue({
        data: [{ id: "7", name: "Essay", due_at: "2026-10-01T10:00:00Z" }],
        forbidden: false,
      }),
    };

    expect(await syncAssignmentMetadata("42", userId, "Course", client)).toEqual({ synced: 0, errors: 1, removed: 0 });
    expect(sql).toHaveBeenCalledOnce();
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

describe("graded feedback sync", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const assignments = [{ id: "7", name: "Essay", submission: {
    workflow_state: "graded", score: 0, grade: "F", graded_at: "2026-11-12T10:00:00Z",
  } }];
  beforeEach(() => vi.mocked(sql).mockReset().mockResolvedValue([]));

  it("upserts scores and sanitised lecturer feedback with content import off and no rubric", async () => {
    vi.stubEnv("CANVAS_CONTENT_IMPORT", "off");
    try {
      const client = { getAssignments: vi.fn(), getRecentAssignmentFeedback: vi.fn().mockResolvedValue({ data: [{
        assignment_id: "7", user_id: "1", submission_comments: [
          { author_id: "1", comment: "My question" },
          { author_id: "2", author_name: "Lecturer", comment: "<p>Explain &amp; justify</p>", created_at: "2026-11-12T10:00:00Z" },
        ],
      }] }) };
      expect(await syncAssignmentMetadata("42", userId, "Course", client, assignments)).toEqual({ synced: 1, errors: 0, removed: 0 });
      expect(client.getRecentAssignmentFeedback).toHaveBeenCalledOnce();
      const calls = vi.mocked(sql).mock.calls;
      expect(calls[0]).toContain(0);
      expect(calls[0]).toContain("F");
      expect(calls[0]).toContain("2026-11-12T10:00:00Z");
      expect(calls[1][0].join("?")).toContain("ON CONFLICT (assignment_id)");
      expect(calls[1]).toContain(userId);
      expect(calls[1]).toContain(JSON.stringify([{ author_name: "Lecturer", comment: "Explain & justify", created_at: "2026-11-12T10:00:00Z" }]));
      expect(calls[1]).toContain(null);
    } finally { vi.unstubAllEnvs(); }
  });

  it("stores rubric criteria even when Canvas omits submission comments", async () => {
    const client = { getAssignments: vi.fn(), getRecentAssignmentFeedback: vi.fn().mockResolvedValue({ data: [{
      assignment_id: "7", rubric_assessment: { clarity: { points: 0, comments: "<p>Define terms</p>" } },
      assignment: { rubric: [{ id: "clarity", description: "Clarity", points: 5 }] },
    }] }) };
    await syncAssignmentMetadata("42", userId, "Course", client, assignments);
    expect(vi.mocked(sql).mock.calls[1]).toContain(JSON.stringify([
      { id: "clarity", description: "Clarity", points: 0, possible: 5, comment: "Define terms" },
    ]));
    expect(vi.mocked(sql).mock.calls[1][0].join("?")).toContain("ELSE app.assignment_feedback.comments END");
  });

  it.each([
    { data: [], forbidden: true, error: "403" },
    { data: [{ assignment_id: "7", submission_comments: [] }], error: "partial page failure" },
  ])("keeps scores when feedback is unavailable or partial", async feedback => {
    const client = { getAssignments: vi.fn(), getRecentAssignmentFeedback: vi.fn().mockResolvedValue(feedback) };
    expect(await syncAssignmentMetadata("42", userId, "Course", client, assignments)).toEqual({ synced: 1, errors: 0, removed: 0 });
    expect(sql).toHaveBeenCalledOnce();
    expect(vi.mocked(sql).mock.calls[0]).toContain(0);
  });

  it("does not fail metadata sync if the feedback write fails", async () => {
    vi.mocked(sql).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("write failed"));
    const client = { getAssignments: vi.fn(), getRecentAssignmentFeedback: vi.fn().mockResolvedValue({ data: [{ assignment_id: "7", submission_comments: [] }] }) };
    expect(await syncAssignmentMetadata("42", userId, "Course", client, assignments)).toEqual({ synced: 1, errors: 0, removed: 0 });
  });
});
