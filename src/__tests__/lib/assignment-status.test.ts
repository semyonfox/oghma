import { describe, expect, it } from "vitest";
import {
  getAssignmentDueDayDifference,
  getEffectiveAssignmentStatus,
} from "@/lib/notes/utils/assignment-status";

const now = new Date("2026-07-16T12:00:00.000Z");

describe("getEffectiveAssignmentStatus", () => {
  it("marks a past-due manual task as late", () => {
    expect(
      getEffectiveAssignmentStatus(
        { status: "upcoming", due_at: "2026-07-16T11:59:00.000Z" },
        now,
      ),
    ).toBe("late");
  });

  it("does not make completed tasks late", () => {
    expect(
      getEffectiveAssignmentStatus(
        { status: "done", due_at: "2026-07-15T12:00:00.000Z" },
        now,
      ),
    ).toBe("done");
  });

  it("restores stale late tasks when their due date moves forward", () => {
    expect(
      getEffectiveAssignmentStatus(
        { status: "late", due_at: "2026-07-17T12:00:00.000Z" },
        now,
      ),
    ).toBe("upcoming");
  });

  it("keeps undated in-progress tasks unchanged", () => {
    expect(
      getEffectiveAssignmentStatus(
        { status: "in_progress", due_at: null },
        now,
      ),
    ).toBe("in_progress");
  });
});

describe("getAssignmentDueDayDifference", () => {
  it("treats later today as the same calendar day", () => {
    expect(
      getAssignmentDueDayDifference("2026-07-16T20:00:00.000Z", now),
    ).toBe(0);
  });

  it("treats tomorrow as one calendar day away", () => {
    expect(
      getAssignmentDueDayDifference("2026-07-17T00:01:00.000Z", now),
    ).toBe(1);
  });
});
