import { describe, it, expect } from "vitest";
import { shouldSyncAssignment } from "@/lib/canvas/sync-assignments.js";

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
    expect(
      shouldSyncAssignment({ published: true, due_at: "2026-03-01T10:00:00Z" }),
    ).toBe(true);
  });
});
